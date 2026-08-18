import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // 1. Get the image data sent from your frontend page
    const body = await request.json();

    // 2. Forward that exact data to your Python FastAPI server
    const pythonResponse = await fetch('http://127.0.0.1:8000/analyze-road', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // 3. Check if Python crashed or returned an error
    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      console.error("Python Backend Error:", errorText);
      return NextResponse.json(
        { error: `Python backend failed: ${pythonResponse.status}` }, 
        { status: pythonResponse.status }
      );
    }

    // 4. Get the successful AI data back from Python
    const data = await pythonResponse.json();
    
    // 5. Send it back to your frontend UI to display!
    return NextResponse.json(data);

  } catch (error) {
    console.error("Next.js API Route Error:", error);
    return NextResponse.json(
      { error: 'Failed to communicate with the Python backend.' }, 
      { status: 500 }
    );
  }
}