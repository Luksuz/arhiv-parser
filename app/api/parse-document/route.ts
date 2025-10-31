import OpenAI from "openai"
import { NextRequest } from "next/server"

export const maxDuration = 60

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.SITE_URL || "https://localhost:3000",
    "X-Title": "Drzavni Arhiv u Varazdinu - AI Obrada Inventara",
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
      "You are an expert archival data extraction assistant. Extract structured archival records from documents following the Croatian archival standard format. Be EXTREMELY LITERAL and PRECISE - do not interpret, rename, or invent anything. ALWAYS start by extracting the FOND level (razina: 'fond') as the FIRST record. CRITICAL: Keep ALL text in Croatian - do NOT translate to English. If text has OCR errors or missing letters (e.g., 'SAD AJ' instead of 'SADRŽAJ', 'Nadlenost' instead of 'Nadležnost'), correct them to proper Croatian spelling while preserving the original meaning."

    const userPrompt = `Extract archival records from this document with ABSOLUTE PRECISION. Follow these CRITICAL rules:

MANDATORY RULES:
1. CROATIAN LANGUAGE ONLY: Extract ALL text in Croatian - do NOT translate any words to English. Keep EVERY word, date, name, description EXACTLY as written in Croatian. "Rješenja o osnivanju komisija" stays "Rješenja o osnivanju komisija" - NEVER "Decisions on establishing committees"
1a. TEXT NORMALIZATION: If text has OCR errors or missing letters, FIX them to proper Croatian:
   - "SAD AJ I USTROJ" → "SADRŽAJ I USTROJ" (add missing Ž)
   - "Nadlenost" → "Nadležnost" (add Ž)
   - "podru je djelatnosti" → "područje djelatnosti" (fix space/merge)
   - Fix missing diacritics: add Ž, Š, Č, Ć, Đ where they belong in Croatian words
   - Keep the meaning and structure, just correct the spelling
2. ALWAYS START WITH FOND: The FIRST record MUST be the fond level (razina: "fond"). Look for sections like "1. IDENTIFIKACIJA" or "Signatura: HR-DAVŽ-XX" and extract the fond information FIRST
3. SIGNATURES ARE PRIMARY: Use the exact signature (HR-DAVŽ-XX, HR-DAVŽ-XX/1, HR-DAVŽ-XX/1.1, etc.) as the MAIN identifier
4. EXACT TITLES ONLY: Copy titles EXACTLY as written - do NOT rephrase, shorten, or interpret. Character-by-character accuracy required.
5. NO INVENTIONS: Extract ONLY what exists - do NOT create, invent, or add any records that are not explicitly present
6. NO SKIPPING: Extract EVERY level in order - do NOT skip any podserija or komad
7. PRESERVE HIERARCHY: If signature is HR-DAVŽ-58/1 = serija, HR-DAVŽ-58/1.2 = podserija, HR-DAVŽ-58/1.2.3 = komad
8. FORMATTING CLUES: Watch for indentation and formatting to recognize hierarchy levels
9. NUMBERING ERRORS: If subsection numbers seem wrong (e.g., "4.4" within serija 3), follow the HR-DAVŽ signature and context to determine correct parent, but keep the title EXACTLY as written in Croatian

HIERARCHY DETECTION:
- FOND (razina: "fond"): ONLY "1. IDENTIFIKACIJA" section - extract ONLY basic metadata (Signatura, Naslov, Vrijeme, Količina)
- ALL OTHER SECTIONS after fond are SEPARATE RECORDS to be extracted:
  * Sections like "2. KONTEKST", "2.1. Naziv stvaratelja", "2.2. Upravna povijest", "3. SADRŽAJ I USTROJ" etc. are SERIJE or PODSERIJE - extract them!
  * Do NOT put these sections in the "sadrzaj" of fond - they are separate hierarchical records!
- Lines starting with "HR-DAVŽ-XX/" followed by number = SERIJA (razina: "serija")
- Lines with numbered subsections (2.1, 2.2.1, 3.1, etc.) = PODSERIJA or KOMAD depending on depth
- Titles without numbers but indented = often PODSERIJA within a serija
- Items with "kut. br.", "knj. br.", "svež. br." = usually KOMAD (lowest level)

CRITICAL: FOND is ONLY basic info from "1. IDENTIFIKACIJA". Everything else (sections 2, 3, 4, 5, 6, and all HR-DAVŽ-XX/... items) are separate records!

CONCRETE EXAMPLES:
Example 1 - Fond (MUST BE FIRST RECORD):
  Document has section "1. IDENTIFIKACIJA" with:
    "1.1. Signatura: HR-DAVŽ-58"
    "1.2. Naslov: Narodni odbor općine Cestica"
    "1.3. Vrijeme nastanka gradiva: [1951.]1952 - 1955.[1955 - 1957.]"
    "1.4. Razina opisa: fond"
    "1.5. Količina i nosač zapisa: 1 kutija - 6 knjiga – 1 svežanj; 0,30 d/m"
  
  Extract as FIRST record:
    identifikator: "HR-DAVŽ-58"
    naslov: "Narodni odbor općine Cestica"
    razina: "fond"
    visaID: ""
    vrijemeOd: "1952"
    vrijemeDo: "1955"
    kolicina: "1 kutija - 6 knjiga – 1 svežanj; 0,30 d/m"

Example 2a - Sections after fond (extract as separate records):
  Document has sections after "1. IDENTIFIKACIJA":
    "2. KONTEKST"
    "2.1. Naziv stvaratelja"
    "2.2. Upravna povijest"
    "3. SADRŽAJ I USTROJ"
  
  Extract each as separate record:
    identifikator: "HR-DAVŽ-58.2", naslov: "KONTEKST", razina: "serija", visaID: "HR-DAVŽ-58"
    identifikator: "HR-DAVŽ-58.2.1", naslov: "Naziv stvaratelja", razina: "podserija", visaID: "HR-DAVŽ-58.2"
    identifikator: "HR-DAVŽ-58.2.2", naslov: "Upravna povijest", razina: "podserija", visaID: "HR-DAVŽ-58.2"
    identifikator: "HR-DAVŽ-58.3", naslov: "SADRŽAJ I USTROJ", razina: "serija", visaID: "HR-DAVŽ-58"

Example 2b - Serija with HR-DAVŽ signature:
  "HR-DAVŽ-58/1. RAD SREDIŠNJIH TIJELA, 1952."
  = identifikator: "HR-DAVŽ-58/1", naslov: "RAD SREDIŠNJIH TIJELA, 1952." (EXACT), razina: "serija", visaID: "HR-DAVŽ-58"

Example 3 - Podserija (with explicit number):
  "1.2. Rješenja o osnivanju komisija, 1952."
  = identifikator: "HR-DAVŽ-58/1.2", naslov: "Rješenja o osnivanju komisija, 1952." (EXACT IN CROATIAN!), razina: "podserija", visaID: "HR-DAVŽ-58/1"
  
  ❌ WRONG: "Decisions on establishing committees, 1952." (translated to English)
  ✅ CORRECT: "Rješenja o osnivanju komisija, 1952." (kept in Croatian)

Example 4 - Podserija (without explicit number but within serija):
  "Registraturna pomagala, 1952 - 1955."
  = identifikator: "HR-DAVŽ-58/2.1", naslov: "Registraturna pomagala, 1952 - 1955." (EXACT), razina: "podserija", visaID: "HR-DAVŽ-58/2"

Example 5 - Komad (lowest level, often has kut./knj./svež. br.):
  "2.1.1. Opći urudžbeni zapisnik 1952 - 1954. knj. br. 1"
  = identifikator: "HR-DAVŽ-58/2.1.1", naslov: "Opći urudžbeni zapisnik 1952 - 1954." (EXACT IN CROATIAN!), razina: "komad", visaID: "HR-DAVŽ-58/2.1", brojTehnickeJedinice: "knj. br. 1"
  
  ❌ WRONG: "General registration log 1952 - 1954." (translated)
  ✅ CORRECT: "Opći urudžbeni zapisnik 1952 - 1954." (Croatian)

EXTRACTION ORDER - Always extract in this order:
1. FIRST: Extract FOND from "1. IDENTIFIKACIJA" section (ONLY basic metadata)
2. SECOND: Extract ALL other sections as separate records:
   - Sections "2. KONTEKST", "2.1 Naziv stvaratelja", "2.2 Upravna povijest", "3. SADRŽAJ I USTROJ", etc. are separate records
   - Sections "HR-DAVŽ-58/1", "HR-DAVŽ-58/2", etc. are serijas
3. THIRD: Extract all podserijas and komads under each serija

CRITICAL: Do NOT include content from sections 2-6 in the fond's "sadrzaj" field - extract them as separate records!

COMPLETE EXAMPLE - Full extraction including FOND:
Document has:
  [First section "1. IDENTIFIKACIJA":]
    "1.1. Signatura: HR-DAVŽ-58"
    "1.2. Naslov: Narodni odbor općine Cestica"
  
  [Then sections 2-6:]
    "2. KONTEKST"
    "2.1. Naziv stvaratelja"
    "3. SADRŽAJ I USTROJ"
  
  [Later in document - actual archival series:]
  "HR-DAVŽ-58/1. RAD SREDIŠNJIH TIJELA, 1952."
  "Količina: 0,1 kutija"
  [then 3 items below it:]
  "Sazivi sjednica NOO-a Cestica, 1952.    kut. br. 1"
  "1.2. Rješenja o osnivanju komisija, 1952.    kut. br. 1"
  "1.3. Popis odbornika, 1952.    kut. br. 1"

You MUST extract at least 9 records total:
  1. identifikator: "HR-DAVŽ-58", naslov: "Narodni odbor općine Cestica", razina: "fond", visaID: ""
  2. identifikator: "HR-DAVŽ-58.2", naslov: "KONTEKST", razina: "serija", visaID: "HR-DAVŽ-58"
  3. identifikator: "HR-DAVŽ-58.2.1", naslov: "Naziv stvaratelja", razina: "podserija", visaID: "HR-DAVŽ-58.2"
  4. identifikator: "HR-DAVŽ-58.3", naslov: "SADRŽAJ I USTROJ", razina: "serija", visaID: "HR-DAVŽ-58"
  5. identifikator: "HR-DAVŽ-58/1", naslov: "RAD SREDIŠNJIH TIJELA, 1952.", razina: "serija", visaID: "HR-DAVŽ-58", kolicina: "0,1 kutija"
  6. identifikator: "HR-DAVŽ-58/1.1", naslov: "Sazivi sjednica NOO-a Cestica, 1952.", razina: "podserija", visaID: "HR-DAVŽ-58/1", brojTehnickeJedinice: "kut. br. 1"
  7. identifikator: "HR-DAVŽ-58/1.2", naslov: "Rješenja o osnivanju komisija, 1952.", razina: "podserija", visaID: "HR-DAVŽ-58/1", brojTehnickeJedinice: "kut. br. 1"
  8. identifikator: "HR-DAVŽ-58/1.3", naslov: "Popis odbornika, 1952.", razina: "podserija", visaID: "HR-DAVŽ-58/1", brojTehnickeJedinice: "kut. br. 1"

NOTE: Record #1 (FOND) is ONLY from "1. IDENTIFIKACIJA" section!
NOTE: Records #2-4 are from sections 2-6 (KONTEKST, SADRŽAJ, etc.) - these are SEPARATE records, NOT part of fond!
NOTE: Records #5-8 are the actual archival series with HR-DAVŽ-XX/ signatures!
NOTE: ALL titles and content are kept in CROATIAN - no translation to English!

LANGUAGE PRESERVATION & NORMALIZATION EXAMPLES:
❌ WRONG (English translations):
  "naslov": "People's Committee of Cestica Municipality"
  "sadrzaj": "The file contains four decisions on establishing temporary committees"
  
✅ CORRECT (Croatian originals):
  "naslov": "Narodni odbor općine Cestica"
  "sadrzaj": "Cjelina sadrži četiri rješenja o osnivanju privremenih komisija"

OCR ERROR CORRECTION:
❌ WRONG (keep OCR errors):
  "naslov": "SAD AJ I USTROJ"
  "naslov": "Nadlenost, svrha, funkcije i podru je djelatnosti"
  
✅ CORRECT (fix to proper Croatian):
  "naslov": "SADRŽAJ I USTROJ"
  "naslov": "Nadležnost, svrha, funkcije i područje djelatnosti"

Extract ALL records found in the document. Do not limit the number of records - extract everything.
REMEMBER: Keep EVERYTHING in Croatian!

Document content:
${text}`

    console.log("[v1] Sending request to OpenAI API with streaming...")

    const systemPromptWithSchema = `${systemPrompt}

You must respond with ONLY a valid JSON object, no other text. Follow this exact schema:

{
  "records": [
    {
      "identifikator": "string (EXACT signature from document: HR-DAVŽ-58, HR-DAVŽ-58/1, HR-DAVŽ-58/2.1.3, etc. - COPY EXACTLY)",
      "naslov": "string (EXACT title IN CROATIAN - copy word-for-word, but FIX OCR errors like 'SAD AJ' → 'SADRŽAJ', do NOT translate, rephrase or shorten)",
      "razina": "string (Level: Fond, serija, podserija, or komad - based on signature depth)",
      "visaID": "string (Parent signature - e.g., if this is HR-DAVŽ-58/2.1.3, parent is HR-DAVŽ-58/2.1)",
      "redoslijed": "string (Sequential number within parent level)",
      "vrijemeOd": "string (Start date/year - exact as written IN CROATIAN)",
      "vrijemeDo": "string (End date/year - exact as written IN CROATIAN)",
      "sadrzaj": "string (Content description - exact text from document IN CROATIAN, FIX OCR errors if present, do NOT translate)",
      "napomena": "string (Notes or remarks - exact text IN CROATIAN, FIX OCR errors if present, do NOT translate)",
      "kolicina": "string (Quantity - exact as written, e.g., '0,1 kutija (0,01 d/m)', '19 knjiga')",
      "brojTehnickeJedinice": "string (Technical unit - exact as written, e.g., 'kut. br. 1', 'knj. br. 2', 'svež. br. 3')",
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

CRITICAL REMINDERS:
- CROATIAN LANGUAGE: ALL extracted text must remain in Croatian - NO English translations!
- OCR ERROR CORRECTION: Fix missing letters and diacritics (Ž, Š, Č, Ć, Đ) to proper Croatian spelling
- THE FIRST RECORD IN "records" ARRAY MUST ALWAYS BE THE FOND (razina: "fond")!
- FOND = ONLY "1. IDENTIFIKACIJA" section! Do NOT include sections 2-6 in fond's sadrzaj!
- ALL OTHER SECTIONS (2. KONTEKST, 2.1, 2.2, 3. SADRŽAJ I USTROJ, 4, 5, 6, etc.) are SEPARATE records to extract!
- identifikator: MUST be exact signature from document (never invent)
- naslov: MUST be exact title IN CROATIAN, correcting OCR errors if present (never paraphrase, never translate)
- sadrzaj: MUST be exact description IN CROATIAN, correcting OCR errors if present
- napomena: MUST be exact notes IN CROATIAN, correcting OCR errors if present
- razina: fond (top level, always first), serija (HR-DAVŽ-58/1 or sections like "2. KONTEKST"), podserija (HR-DAVŽ-58/1.2 or "2.1"), komad (HR-DAVŽ-58/1.2.3)
- Extract EVERY record in sequential order - do NOT skip any
- Order: FOND → Section 2 & subsections → Section 3 & subsections → ... → HR-DAVŽ-58/1 & its podserijas → HR-DAVŽ-58/2 → etc.

WRONG EXAMPLE (translated to English):
  "naslov": "Decisions on establishing committees, 1952."  ❌ NEVER DO THIS!

CORRECT EXAMPLE (kept in Croatian):
  "naslov": "Rješenja o osnivanju komisija, 1952."  ✅ ALWAYS DO THIS!

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
