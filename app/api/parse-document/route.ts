import OpenAI from "openai"
import { NextRequest } from "next/server"

export const maxDuration = 60

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.SITE_URL || "https://localhost:3000",
    "X-Title": "Arhiv Parser",
  },
})

const archivalRecordJsonSchema = {
  name: "archival_record_schema",
  schema: {
    type: "object",
    properties: {
      records: {
        type: "array",
        items: {
          type: "object",
          properties: {
            identifikator: { type: "string", description: "Unique identifier (e.g., HR-DAVŽ-69)", default: "" },
            naslov: { type: "string", description: "Title or name of the archival record", default: ""   },
            razina: { type: "string", description: "Level (Fond, serija, podserija, komad)", default: "" },
            visaID: { type: "string", description: "Higher level ID reference", default: "" },
            redoslijed: { type: "string", description: "Order or sequence number", default: "" },
            vrijemeOd: { type: "string", description: "Start date/year", default: "" },
            vrijemeDo: { type: "string", description: "End date/year", default: "" },
            sadrzaj: { type: "string", description: "Content description", default: "" },
            napomena: { type: "string", description: "Notes or remarks", default: "" },
            kolicina: { type: "string", description: "Quantity (e.g., 19 knjiga)", default: "" },
            brojTehnickeJedinice: { type: "string", description: "Technical unit number (e.g., kut. br. 2)", default: "" },
            jezik1: { type: "string", description: "Primary language", default: "" },
            jezik2: { type: "string", description: "Secondary language", default: "" },
            pismo1: { type: "string", description: "Primary script", default: "" },
            pismo2: { type: "string", description: "Secondary script", default: "" },
            vrstaGradje: { type: "string", description: "Type of material", default: "" },
            vrstaZapisa: { type: "string", description: "Type of record", default: "" },
            vrstaSadrzaja: { type: "string", description: "Type of content", default: ""   },
            institucija: { type: "string", description: "Institution code", default: "" },
            statusZapisa: { type: "string", description: "Record status", default: "" },
            zaObjavu: { type: "string", description: "Publication status", default: "" },
            uvjetiKoristenja: { type: "string", description: "Terms of use URL", default: "" },
          },
          required: [
            "identifikator", "naslov", "razina", "visaID", "redoslijed", "vrijemeOd", "vrijemeDo",
            "sadrzaj", "napomena", "kolicina", "brojTehnickeJedinice", "jezik1", "jezik2",
            "pismo1", "pismo2", "vrstaGradje", "vrstaZapisa", "vrstaSadrzaja", "institucija",
            "statusZapisa", "zaObjavu", "uvjetiKoristenja",
          ],
        },
      },
    },
    required: ["records"],
  },
}

async function extractTextFromFile(file: { data: string; mediaType: string; filename: string }): Promise<string> {
  const base64Data = file.data.split(",")[1] || file.data
  const buffer = Buffer.from(base64Data, "base64")

  if (file.mediaType === "text/plain" || file.filename.endsWith(".txt")) {
    return buffer.toString("utf-8")
  }

  if (file.mediaType === "application/pdf" || file.filename.endsWith(".pdf")) {
    const pdfParseModule = await import("pdf-parse")
    const pdfParse = (pdfParseModule as any).default as (data: Buffer) => Promise<{ text: string }>
    const pdfData = await pdfParse(buffer)
    return pdfData.text
    
  }

  if (
    file.mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.filename.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (file.mediaType === "application/msword" || file.filename.endsWith(".doc")) {
    return buffer.toString("utf-8") // fallback
  }

  throw new Error(`Unsupported file type: ${file.mediaType}`)
}

export async function POST(req: Request) {
  try {
    const { file } = await req.json()
    if (!file?.data) {
      return Response.json({ error: "No file provided" }, { status: 400 })
    }

    console.log("[v1] Extracting text from:", file.filename)
    const text = (await extractTextFromFile(file)).replace(/\s+/g, " ").trim()

    if (text.length < 50) {
      return Response.json({ error: "Document appears empty or too short." }, { status: 400 })
    }

    console.log("[v1] Extracted text length:", text.length)

    const systemPrompt =
      "You are an expert archival data extraction assistant. Extract structured archival records from documents following the Croatian archival standard format."

    const userPrompt = `Extract archival records from this document. Follow the Croatian archival standard and fill every field in the schema if possible. Use empty strings where information is missing.

Extract ALL records found in the document. Do not limit the number of records - extract everything.

Document content:
${text}`

    console.log("[v1] Sending request to OpenAI API with streaming...")

    const systemPromptWithSchema = `${systemPrompt}

You must respond with ONLY a valid JSON object, no other text. Follow this exact schema:

{
  "records": [
    {
      "identifikator": "string (Unique identifier, e.g., HR-DAVŽ-69)",
      "naslov": "string (Title or name of the archival record)",
      "razina": "string (Level: Fond, serija, podserija, or komad)",
      "visaID": "string (Higher level ID reference)",
      "redoslijed": "string (Order or sequence number)",
      "vrijemeOd": "string (Start date/year)",
      "vrijemeDo": "string (End date/year)",
      "sadrzaj": "string (Content description)",
      "napomena": "string (Notes or remarks)",
      "kolicina": "string (Quantity, e.g., 19 knjiga)",
      "brojTehnickeJedinice": "string (Technical unit number, e.g., kut. br. 2)",
      "jezik1": "string (Primary language)",
      "jezik2": "string (Secondary language)",
      "pismo1": "string (Primary script)",
      "pismo2": "string (Secondary script)",
      "vrstaGradje": "string (Type of material)",
      "vrstaZapisa": "string (Type of record)",
      "vrstaSadrzaja": "string (Type of content)",
      "institucija": "string (Institution code)",
      "statusZapisa": "string (Record status)",
      "zaObjavu": "string (Publication status)",
      "uvjetiKoristenja": "string (Terms of use URL)"
    }
  ]
}

Use empty strings for missing fields. Return ONLY the JSON, nothing else.`

    const stream = await client.chat.completions.create({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemPromptWithSchema },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    })

    // Create a readable stream to send data to the client
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          let fullContent = ""
          let chunkCount = 0
          
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ""
            if (content) {
              fullContent += content
              chunkCount++
              
              // Log first chunk immediately
              if (chunkCount === 1) {
                console.log(`[v1] First chunk received! Streaming started...`)
              }
              
              // Log every 10 chunks to avoid spam
              if (chunkCount % 10 === 0) {
                console.log(`[v1] Streamed ${chunkCount} chunks, ${fullContent.length} chars`)
              }
              
              // Send the accumulated content as Server-Sent Events
              const data = JSON.stringify({ 
                type: "content", 
                content: fullContent,
                done: false 
              })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            }
          }
          
          console.log(`[v1] Streaming complete. Total chunks: ${chunkCount}, Total chars: ${fullContent.length}`)
          
          // Parse the complete JSON and send records
          try {
            const parsed = JSON.parse(fullContent)
            const finalData = JSON.stringify({ 
              type: "complete", 
              records: parsed.records || [],
              done: true 
            })
            controller.enqueue(encoder.encode(`data: ${finalData}\n\n`))
            console.log("[v1] Records extracted:", parsed?.records?.length || 0)
          } catch (parseError) {
            console.error("[v1] Error parsing final JSON:", parseError)
            const errorData = JSON.stringify({ 
              type: "error", 
              error: "Failed to parse JSON",
              done: true 
            })
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
          }
          
          controller.close()
        } catch (error) {
          console.error("[v1] Streaming error:", error)
          const errorData = JSON.stringify({ 
            type: "error", 
            error: error instanceof Error ? error.message : "Unknown error",
            done: true 
          })
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (error) {
    console.error("[v1] Error parsing document:", error)
    return Response.json(
      { error: "Failed to parse document", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
