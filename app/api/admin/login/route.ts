import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

// Hardcoded admin credentials
const ADMIN_USERNAME = "admin"
const ADMIN_PASSWORD = "MindXGlobal2025!"

// Session storage (in production, use Redis or a database)
const sessions = new Map<string, { expiresAt: number }>()

// Clean up expired sessions every minutee
setInterval(() => {
  const now = Date.now()
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(sessionId)
    }
  }
}, 60000)

function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const sessionId = generateSessionId()
      const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour

      sessions.set(sessionId, { expiresAt })

      const response = NextResponse.json({ 
        success: true, 
        message: "Login successful",
        expiresIn: 60 * 60 * 1000 // 1 hour
      })

      // Set cookie
      response.cookies.set("admin_session", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60, // 1 hour in seconds
      })

      return response
    }

    return NextResponse.json(
      { success: false, message: "Invalid credentials" },
      { status: 401 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionId = cookieStore.get("admin_session")?.value

    if (!sessionId) {
      return NextResponse.json({ isAdmin: false })
    }

    const session = sessions.get(sessionId)
    
    if (!session || session.expiresAt < Date.now()) {
      if (session) sessions.delete(sessionId)
      return NextResponse.json({ isAdmin: false })
    }

    return NextResponse.json({ 
      isAdmin: true,
      expiresAt: session.expiresAt
    })
  } catch (error) {
    return NextResponse.json({ isAdmin: false })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionId = cookieStore.get("admin_session")?.value

    if (sessionId) {
      sessions.delete(sessionId)
    }

    const response = NextResponse.json({ success: true, message: "Logged out" })
    response.cookies.delete("admin_session")

    return response
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    )
  }
}

