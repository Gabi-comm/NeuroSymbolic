import cv2
import torch
import numpy as np
import base64
import json
import os
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import google.generativeai as genai
from ultralytics import YOLO
from segment_anything import sam_model_registry, SamPredictor
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# --- CRITICAL FIX: Add CORS Middleware ---
# This allows your Next.js frontend to actually get the data back
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows Next.js to talk to Python
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading AI Models into memory. This may take a moment...")

# Security Fix: It is highly recommended to use environment variables for this instead of hardcoding!
# You can set this temporarily here, but don't upload this key to GitHub.
genai.configure(api_key="AIzaSyBtIQQys_Pe3elLevxp_hfTHaY3ogVKlr4") #apikey

# Load YOLO Models
try:
    road_model = YOLO('ultrabestroad.pt')
    crack_model = YOLO('best.pt')
except Exception as e:
    print(f"Error loading YOLO models: {e}")

# Load SAM Model
try:
    sam_checkpoint = "sam_files/sam_vit_b_01ec64.pth"
    sam = sam_model_registry["vit_b"](checkpoint=sam_checkpoint)
    predictor = SamPredictor(sam)
except Exception as e:
    print(f"Error loading SAM model: {e}")

print("Models loaded successfully! Server is ready.")

# ==========================================
# 2. DATA MODELS & UTILS
# ==========================================
class ImageRequest(BaseModel):
    image_base64: str

def decode_base64_img(base64_str):
    """Converts a Base64 string from Next.js into a standard OpenCV image array."""
    try:
        header, encoded = base64_str.split(",", 1) if "," in base64_str else ("", base64_str)
        img_bytes = base64.b64decode(encoded)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        print(f"Error decoding image: {e}")
        return None


def detect_road(model, img):
    road_results = road_model.predict(img)
    return road_results

def get_birds_eye_view(img, road_results):
    h, w = img.shape[:2]

    if road_results[0].masks is None:
        return img.copy()

    # Extract and resize the road mask
    masks = road_results[0].masks.data.cpu().numpy()
    combined = np.zeros((masks.shape[1], masks.shape[2]), dtype=np.uint8)
    for m in masks:
        combined = np.maximum(combined, m)
    
    mask = (combined * 255).astype(np.uint8)
    mask = cv2.resize(mask, (w, h))

    # Clean mask noise
    kernel = np.ones((5,5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # Scan road edges at specific horizontal lines
    ys = np.linspace(int(h*0.3), int(h*0.95), 60).astype(int)
    left_edges, right_edges, valid_ys = [], [], []

    for y in ys:
        xs = np.where(mask[y] > 0)[0]
        if len(xs) > 0 and (xs.max() - xs.min()) > w * 0.1:
            left_edges.append(xs.min())
            right_edges.append(xs.max())
            valid_ys.append(y)

    if len(left_edges) < 10:
        return img.copy()

    # Smooth edges with polynomial fitting
    le = np.polyval(np.polyfit(range(len(left_edges)), left_edges, 2), range(len(left_edges))).astype(int)
    re = np.polyval(np.polyfit(range(len(right_edges)), right_edges, 2), range(len(right_edges))).astype(int)

    # Define trapezoid source points
    top_idx, bot_idx = len(le) // 8, -len(le) // 8
    top_l, top_r = int(np.mean(le[:top_idx])), int(np.mean(re[:top_idx]))
    bot_l, bot_r = int(np.mean(le[bot_idx:])), int(np.mean(re[bot_idx:]))
    top_y, bot_y = valid_ys[0], valid_ys[-1]

    # Expand trapezoid for wider field of view
    expand = int((bot_r - bot_l) * 0.25)
    src = np.float32([
        [max(0, top_l - expand), top_y],
        [min(w-1, top_r + expand), top_y],
        [max(0, bot_l - expand), bot_y],
        [min(w-1, bot_r + expand), bot_y]
    ])

    # Map to rectangular destination points
    width, height = 700, 700
    dst = np.float32([[0, 0], [width, 0], [0, height], [width, height]])

    # Apply perspective transformation
    M = cv2.getPerspectiveTransform(src, dst)
    bev = cv2.warpPerspective(img, M, (width, height))

    return bev

def detect_crack(model, bev_img):
    crack_results = crack_model.predict(bev_img, conf=0.1) #confidence 
    return crack_results

def filter_overlapping_boxes(boxes, iou_threshold=0.4):
    if boxes is None or len(boxes) == 0:
        return []

    boxes_xyxy = boxes.xyxy.cpu().numpy()
    scores = boxes.conf.cpu().numpy()

    indices = cv2.dnn.NMSBoxes(
        bboxes=[(int(x1), int(y1), int(x2-x1), int(y2-y1)) for x1,y1,x2,y2 in boxes_xyxy],
        scores=scores.tolist(),
        score_threshold=0.0,
        nms_threshold=iou_threshold
    )

    if len(indices) == 0:
        return []

    indices = indices.flatten()
    return boxes[indices]

def skeletonize_opencv(img):
    skel = np.zeros(img.shape, np.uint8)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3,3))

    while True:
        open_ = cv2.morphologyEx(img, cv2.MORPH_OPEN, element)
        temp = cv2.subtract(img, open_)
        eroded = cv2.erode(img, element)
        skel = cv2.bitwise_or(skel, temp)
        img = eroded.copy()

        if cv2.countNonZero(img) == 0:
            break

    return skel

def trace_cracks(image, crack_results, predictor, gsd, pavement_type):
    if not crack_results or crack_results[0].masks is None:
        return [], image.copy(), np.zeros(image.shape[:2], dtype=np.uint8)

    boxes_filtered = filter_overlapping_boxes(crack_results[0].boxes)
    if len(boxes_filtered) == 0:
        return [], image.copy(), np.zeros(image.shape[:2], dtype=np.uint8)

    traced = []
    predictor.set_image(image) 
    debug_img = image.copy()
    pure_skeleton = np.zeros(image.shape[:2], dtype=np.uint8)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    yolo_masks = crack_results[0].masks.data
    yolo_boxes = crack_results[0].boxes.xyxy.cpu().numpy().astype(int)
    confidences = crack_results[0].boxes.conf.cpu().numpy()
    
    # Get the class IDs and names from the model
    class_ids = crack_results[0].boxes.cls.cpu().numpy().astype(int)
    names = crack_results[0].names 

    for i in range(len(yolo_boxes)):
        x1, y1, x2, y2 = yolo_boxes[i]
        label = names[class_ids[i]] 
        
        # --- 1. MASK GENERATION ---
        masks, _, _ = predictor.predict(box=np.array([x1, y1, x2, y2]), multimask_output=False)
        sam_mask = masks[0].astype(np.uint8) * 255
        y_mask_raw = yolo_masks[i].cpu().numpy()
        y_mask_resized = cv2.resize(y_mask_raw, (image.shape[1], image.shape[0]))
        y_mask_binary = (y_mask_resized > 0.5).astype(np.uint8) * 255
        consensus_mask = cv2.bitwise_and(sam_mask, y_mask_binary)
        
        # --- 2. CLEANING ---
        roi_fence = consensus_mask[y1:y2, x1:x2]
        roi_gray = gray[y1:y2, x1:x2]
        crack_pixels = cv2.adaptiveThreshold(
            cv2.GaussianBlur(roi_gray, (5, 5), 0), 255, 
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 5
        )
        valid_cracks = cv2.bitwise_and(crack_pixels, roi_fence)
        cleaned_cracks = cv2.morphologyEx(valid_cracks, cv2.MORPH_OPEN, np.ones((2,2), np.uint8))

        mask_pixels = cv2.countNonZero(cleaned_cracks)
        if mask_pixels < 10: continue

        # --- 3. METRIC BRANCHING ---
        skel = skeletonize_opencv(cleaned_cracks)
        length_px = cv2.countNonZero(skel)
        
        
        physical_metric = 0.0
        unit = ""
        measurement_type = ""
        
        if label in ["Alligator Crack", "Pothole"]:
            physical_metric = (mask_pixels * (gsd**2)) / 1000000.0
            unit = "sq.m"
            measurement_type = "Area"
            width_mm = (mask_pixels / length_px * gsd) if length_px > 0 else 0
        else:
            physical_metric = (length_px * gsd) / 1000.0
            unit = "m"
            measurement_type = "Length"
            width_mm = (mask_pixels / length_px * gsd) if length_px > 0 else 0

        # --- 4. SEVERITY THRESHOLDS ---
        if width_mm < 3.0:
            severity = "Low"
        elif width_mm <= 6.0:
            severity = "Medium"
        else:
            severity = "High"

        # --- 5. UPDATE VISUALS WITH LABELS ---
        pure_skeleton[y1:y2, x1:x2] = cv2.bitwise_or(pure_skeleton[y1:y2, x1:x2], skel)
        debug_img[y1:y2, x1:x2][skel > 0] = [0, 0, 255]
        cv2.rectangle(debug_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        
        text_overlay = f"{label} ({severity})"
        cv2.putText(debug_img, text_overlay, (x1, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        traced.append({
            "label": label,
            "measurement_type": measurement_type,
            "metric_value": physical_metric,
            "unit": unit,
            "width_mm": width_mm,
            "severity": severity,
            "confidence": float(confidences[i])
        })

    return traced, debug_img, pure_skeleton

def generate_maintenance_bulletin(road_data):
        
    # FIX 1: Updated the Gemini Model name to the correct version
    model = genai.GenerativeModel('gemini-2.5-flash')

    
    prompt = f"""
    You are an expert civil engineer and pavement management specialist working with DPWH standards.
    Review the following automated road condition data. 
    
    Analyze the density (Overall Extent %) and the severity of the specific distresses to create a structured 'Maintenance Bulletin Recommendation'.
    
    Here is the telemetry data:
    {json.dumps(road_data, indent=2)}
    
    Please output your response in the following format, make it all brief and bulletin form:
    Road Segment Health Summary:
    (Provide a brief 2-3 sentence assessment of the road's current state based on distress density and severity.)
    
    Recommended Interventions:
    (List specific actions based on the distress types. E.g., crack sealing for low-severity longitudinal cracks, partial-depth patching for high-severity potholes, or mill-and-overlay if the extent % is too high.)
    
    Priority Level:
    (Assign a priority: Routine, Moderate, High, or Urgent, and briefly justify why.)

    do not include "**" and summarize it into 3-5 bulletin
    """
    
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Error connecting to Gemini API: {e}"


@app.post("/analyze-road")
async def analyze_road(request: ImageRequest):
    try:
        print("--- Request Received via Base64 JSON ---")
        
        # 1. Decode Image
        img = decode_base64_img(request.image_base64)
        if img is None:
            return JSONResponse(status_code=400, content={"message": "Invalid Image Data"})

        # 2. Road Detection
        road_results = road_model.predict(img, conf=0.25)
        
        # 3. Bird's Eye View (The part we just fixed!)
        print("Calculating Bird's Eye View...")
        bev_img = get_birds_eye_view(img, road_results)

        # 4. Crack Detection on BEV
        print("Running Crack Detection on BEV...")
        crack_results = detect_crack(crack_model, bev_img)

        # 5. SAM Tracing & Metric Measurement
        # GSD (Ground Sample Distance) is pixels-to-mm conversion. 
        # 1.5 is a common estimate; adjust based on your camera height.
        gsd = 1.5 
        print("Tracing cracks with SAM & Calculating Metrics...")
        traced_data, debug_img, skel = trace_cracks(bev_img, crack_results, predictor, gsd, "Asphalt")

        # 6. Encode the "Analyzed Image" back to Base64 (Crucial for the UI!)
        _, buffer = cv2.imencode('.jpg', debug_img)
        encoded_image = base64.b64encode(buffer).decode('utf-8')
        image_url = f"data:image/jpeg;base64,{encoded_image}"

        # 7. Consult Gemini AI
        print("Consulting Gemini AI...")
        bulletin = generate_maintenance_bulletin(traced_data if traced_data else [{"type": "Clear"}])

        # 8. Return everything!
        return {
            "fileUrl": image_url, 
            "distresses": traced_data if traced_data else [{"label": "Clear", "severity": "Low", "confidence": 1.0}],
            "gemini_bulletin": bulletin,
            "overall_severity": traced_data[0]['severity'] if traced_data else "Low"
        }

    except Exception as e:
        print(f"CRITICAL ERROR: {str(e)}")
        # We send the error back to the browser so you can see it in the console
        return JSONResponse(status_code=500, content={"message": str(e)})