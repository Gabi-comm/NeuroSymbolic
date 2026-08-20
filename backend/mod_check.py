
from ultralytics import YOLO

model=YOLO(r"C:\Users\Gab\Documents\GitHub\NeuroSymbolic\backend\ultrabestroad.pt")
results=model.val(data=r"C:\Users\Gab\Documents\GitHub\NeuroSymbolic\backend\data.yaml")
print(f"Precision (All classes): {results.results_dict['metrics/precision(B)']:.4f}")
print(f"Recall (All classes):    {results.results_dict['metrics/recall(B)']:.4f}")
print(f"mAP50:                   {results.results_dict['metrics/mAP50(B)']:.4f}")
print(f"mAP50-95:                {results.results_dict['metrics/mAP50-95(B)']:.4f}")
