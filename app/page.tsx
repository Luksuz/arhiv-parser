"use client"

import type React from "react"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, FileText, Loader2, Download, Sparkles, CheckCircle2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ArchivalRecord = {
  identifikator: string
  naslov: string
  razina: string
  visaID: string
  redoslijed: string
  vrijemeOd: string
  vrijemeDo: string
  sadrzaj: string
  napomena: string
  kolicina: string
  brojTehnickeJedinice: string
  jezik1: string
  jezik2: string
  pismo1: string
  pismo2: string
  vrstaGradje: string
  vrstaZapisa: string
  vrstaSadrzaja: string
  institucija: string
  statusZapisa: string
  zaObjavu: string
  uvjetiKoristenja: string
}

export default function DocumentParserPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [extractedData, setExtractedData] = useState<ArchivalRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      const validTypes = [
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ]

      if (validTypes.includes(selectedFile.type) || selectedFile.name.endsWith(".doc")) {
        setFile(selectedFile)
        setError(null)
      } else {
        setError("Please upload a valid document file (PDF, TXT, DOC, or DOCX)")
        setFile(null)
      }
    }
  }

  const parsePartialJSON = (jsonStr: string): ArchivalRecord[] => {
    try {
      // Try to parse the complete JSON first
      const parsed = JSON.parse(jsonStr)
      return parsed.records || []
    } catch {
      // Extract INCOMPLETE and COMPLETE records for ultra-live streaming
      try {
        const recordsStart = jsonStr.indexOf('"records"')
        if (recordsStart === -1) return []
        
        const arrayStart = jsonStr.indexOf('[', recordsStart)
        if (arrayStart === -1) return []
        
        const records: ArchivalRecord[] = []
        let currentRecord = ''
        let braceCount = 0
        let inRecord = false
        let inString = false
        let escapeNext = false
        
        // Process all characters to find records
        for (let i = arrayStart + 1; i < jsonStr.length; i++) {
          const char = jsonStr[i]
          
          if (escapeNext) {
            if (inRecord) currentRecord += char
            escapeNext = false
            continue
          }
          
          if (char === '\\') {
            if (inRecord) currentRecord += char
            escapeNext = true
            continue
          }
          
          if (char === '"') {
            inString = !inString
            if (inRecord) currentRecord += char
            continue
          }
          
          if (inString) {
            if (inRecord) currentRecord += char
            continue
          }
          
          if (char === '{') {
            braceCount++
            if (!inRecord) {
              inRecord = true
              currentRecord = '{'
            } else {
              currentRecord += char
            }
          } else if (char === '}') {
            if (inRecord) currentRecord += char
            braceCount--
            if (braceCount === 0 && inRecord) {
              // Complete record - parse it
              try {
                const record = JSON.parse(currentRecord)
                records.push(record)
              } catch {
                // If parsing fails, still try to extract partial data
                const partial = parseIncompleteRecord(currentRecord)
                if (partial) records.push(partial as ArchivalRecord)
              }
              inRecord = false
              currentRecord = ''
            }
          } else if (inRecord) {
            currentRecord += char
          }
        }
        
        // Handle incomplete record at the end
        if (inRecord && currentRecord.length > 2) {
          const partial = parseIncompleteRecord(currentRecord)
          if (partial) records.push(partial as ArchivalRecord)
        }
        
        return records
      } catch (error) {
        console.error("Error parsing partial JSON:", error)
        return []
      }
    }
  }

  // Parse incomplete record to show cell-by-cell updates
  const parseIncompleteRecord = (recordStr: string): Partial<ArchivalRecord> | null => {
    try {
      // Try to close the JSON and parse
      let fixedStr = recordStr
      if (!fixedStr.endsWith('}')) {
        // Count open strings
        const quotes = (fixedStr.match(/"/g) || []).length
        if (quotes % 2 !== 0) {
          fixedStr += '"'
        }
        fixedStr += '}'
      }
      
      const parsed = JSON.parse(fixedStr)
      return parsed
    } catch {
      // If that fails, extract key-value pairs manually
      const partial: any = {}
      const regex = /"(\w+)"\s*:\s*"([^"]*)"/g
      let match
      
      while ((match = regex.exec(recordStr)) !== null) {
        partial[match[1]] = match[2]
      }
      
      return Object.keys(partial).length > 0 ? partial : null
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setLoading(true)
    setError(null)
    setExtractedData([]) // Clear previous results

    try {
      // Convert file to base64
      const reader = new FileReader()
      reader.readAsDataURL(file)

      reader.onload = async () => {
        try {
          const base64 = reader.result as string
          const base64Data = base64.split(",")[1]

          const response = await fetch("/api/parse-document", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              file: {
                data: base64Data,
                mediaType: file.type || "application/octet-stream",
                filename: file.name,
              },
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.details || errorData.error || "Failed to parse document")
          }

          // Handle streaming response
          const streamReader = response.body?.getReader()
          const decoder = new TextDecoder()

          if (!streamReader) {
            throw new Error("No response body")
          }

          let buffer = ""
          let messageCount = 0
          
          while (true) {
            const { done, value } = await streamReader.read()
            
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            
            // Process complete SSE messages
            const lines = buffer.split("\n\n")
            buffer = lines.pop() || "" // Keep incomplete message in buffer
            
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const jsonStr = line.slice(6) // Remove "data: " prefix
                  const message = JSON.parse(jsonStr)
                  messageCount++
                  
                  if (message.type === "content") {
                    // Log first message immediately
                    if (messageCount === 1) {
                      console.log(`[Client] First message received! Content length: ${message.content.length}`)
                      console.log(`[Client] First 100 chars:`, message.content.substring(0, 100))
                    }
                    
                    // Parse partial JSON and update records EVERY message for ultra-live effect
                    const records = parsePartialJSON(message.content)
                    if (records.length > 0) {
                      // Limit to 15 records for demo
                      const limitedRecords = records.slice(0, 15)
                      setExtractedData(limitedRecords as ArchivalRecord[])
                      
                      // Log less frequently to avoid console spam
                      if (messageCount % 20 === 0) {
                        console.log(`[Client] Update ${messageCount}: ${limitedRecords.length} records, ${message.content.length} chars`)
                      }
                      
                      // If we have 15 records, we can consider stopping early
                      if (limitedRecords.length >= 15) {
                        console.log(`[Client] Reached 15 records limit`)
                      }
                    }
                  } else if (message.type === "complete") {
                    // Final complete data - limit to 15 records
                    const limitedRecords = (message.records || []).slice(0, 15)
                    console.log(`[Client] Received complete data: ${limitedRecords.length} records (limited to 15)`)
                    setExtractedData(limitedRecords)
                    setLoading(false)
                  } else if (message.type === "error") {
                    throw new Error(message.error || "Streaming error")
                  }
                } catch (parseError) {
                  console.error("Error parsing SSE message:", parseError)
                }
              }
            }
          }
          
          console.log(`[Client] Stream ended. Total messages: ${messageCount}`)
          
          setLoading(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : "An error occurred")
          setLoading(false)
        }
      }

      reader.onerror = () => {
        setError("Failed to read file")
        setLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setLoading(false)
    }
  }

  const exportToCSV = () => {
    if (extractedData.length === 0) return

    const headers = [
      "Identifikator",
      "Naslov",
      "Razina",
      "VisaID",
      "Redoslijed",
      "VrijemeOd",
      "VrijemeDo",
      "Sadrzaj",
      "Napomena",
      "Količina",
      "Broj tehničke jedinice",
      "Jezik1",
      "Jezik2",
      "Pismo1",
      "Pismo2",
      "VrstaGradje",
      "VrstaZapisa",
      "VrstaSadrzaja",
      "Institucija",
      "StatusZapisa",
      "ZaObjavu",
      "Uvjeti koristenja",
    ]

    const rows = extractedData.map((record) => [
      record.identifikator,
      record.naslov,
      record.razina,
      record.visaID,
      record.redoslijed,
      record.vrijemeOd,
      record.vrijemeDo,
      record.sadrzaj,
      record.napomena,
      record.kolicina,
      record.brojTehnickeJedinice,
      record.jezik1,
      record.jezik2,
      record.pismo1,
      record.pismo2,
      record.vrstaGradje,
      record.vrstaZapisa,
      record.vrstaSadrzaja,
      record.institucija,
      record.statusZapisa,
      record.zaObjavu,
      record.uvjetiKoristenja,
    ])

    const csvContent = [headers.join("\t"), ...rows.map((row) => row.map((cell) => `"${cell}"`).join("\t"))].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = "archival_records.csv"
    link.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-black dark:via-slate-950 dark:to-slate-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 bg-slate-300/5 dark:bg-slate-700/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-gray-300/5 dark:bg-gray-700/5 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [0, -90, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>

      <div className="container mx-auto px-4 py-12 max-w-7xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-slate-200 dark:bg-slate-800/50 rounded-full border border-slate-300 dark:border-slate-700"
          >
            <Sparkles className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              AI-Powered Extraction
            </span>
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-5xl md:text-6xl font-bold mb-4 text-balance bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-gray-800 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white"
          >
            Archival Document Parser
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-lg md:text-xl text-slate-600 dark:text-slate-400 text-pretty max-w-2xl mx-auto"
          >
            Upload documents and extract structured archival data in real-time with streaming AI
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        >
          <Card className="mb-8 border-slate-300/50 dark:border-slate-700/50 shadow-xl backdrop-blur-sm bg-white/90 dark:bg-slate-900/90 overflow-hidden">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-slate-500/3 via-gray-500/3 to-slate-500/3"
              animate={{
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                >
                  <FileText className="h-6 w-6 text-slate-700 dark:text-slate-300" />
                </motion.div>
                Upload Document
              </CardTitle>
              <CardDescription className="text-base">Supported formats: PDF, TXT, DOC, DOCX</CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="space-y-4">
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="flex items-center gap-4"
                >
                  <label htmlFor="file-upload" className="flex-1 cursor-pointer">
                    <motion.div
                      className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center transition-all duration-300"
                      animate={file ? { borderColor: "rgb(71 85 105)" } : {}}
                      whileHover={{
                        borderColor: "rgb(51 65 85)",
                        backgroundColor: "rgba(51, 65, 85, 0.02)",
                      }}
                    >
                      <motion.div
                        animate={file ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.5 }}
                      >
                        <Upload className="h-12 w-12 mx-auto mb-4 text-slate-600 dark:text-slate-400" />
                      </motion.div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {file ? (
                          <span className="flex items-center justify-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            {file.name}
                          </span>
                        ) : (
                          "Click to upload or drag and drop"
                        )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">PDF, TXT, DOC, or DOCX up to 10MB</p>
                    </motion.div>
                    <input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      accept=".pdf,.txt,.doc,.docx"
                      onChange={handleFileChange}
                    />
                  </label>
                </motion.div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
                    >
                      <p className="text-sm text-destructive">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    onClick={handleUpload}
                    disabled={!file || loading}
                    className="w-full bg-gradient-to-r from-slate-800 to-gray-900 hover:from-slate-900 hover:to-black text-white shadow-lg border border-slate-700"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {extractedData.length > 0
                          ? `Streaming... ${extractedData.length} record${extractedData.length !== 1 ? "s" : ""} found`
                          : "Processing..."}
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-5 w-5" />
                        Parse Document
                      </>
                    )}
                  </Button>
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <AnimatePresence>
          {extractedData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
            >
              <Card className="border-slate-300/50 dark:border-slate-700/50 shadow-2xl backdrop-blur-sm bg-white/90 dark:bg-slate-900/90 overflow-hidden">
                <motion.div
                  className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-700 via-gray-700 to-slate-700"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
                <CardHeader className="relative">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-3 text-2xl">
                        <motion.div
                          initial={{ rotate: -180, opacity: 0 }}
                          animate={{ rotate: 0, opacity: 1 }}
                          transition={{ duration: 0.6, type: "spring" }}
                        >
                          <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                        </motion.div>
                        Extracted Records
                        {loading && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="inline-flex items-center gap-1.5 text-sm font-normal text-slate-700 dark:text-slate-300 px-3 py-1 bg-slate-200 dark:bg-slate-800/50 rounded-full border border-slate-300 dark:border-slate-700"
                          >
                            <motion.span
                              animate={{ opacity: [1, 0.3, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                              className="w-2 h-2 bg-slate-700 dark:bg-slate-300 rounded-full"
                            />
                            Live Streaming
                          </motion.span>
                        )}
                      </CardTitle>
                      <CardDescription className="text-base mt-2">
                        <motion.span
                          key={extractedData.length}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="font-semibold text-slate-700 dark:text-slate-300"
                        >
                          {extractedData.length}
                        </motion.span>{" "}
                        / 15 record{extractedData.length !== 1 ? "s" : ""} extracted
                        {loading && " (updating in real-time...)"}
                        <br />
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Demo limit: First 10 rows clear • Rows 11-15 blurred
                        </span>
                      </CardDescription>
                    </div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-300 dark:border-slate-700">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          🔒 Protected Demo
                        </span>
                      </div>
                    </motion.div>
                  </div>
                </CardHeader>
            <CardContent className="relative">
              {/* Watermark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-5 dark:opacity-10">
                <div className="text-9xl font-bold text-slate-900 dark:text-slate-100 rotate-[-45deg] select-none">
                  DEMO
                </div>
              </div>
              
              {/* Scroll indicator */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
              >
                <span>← Scroll horizontally to see all 21 columns →</span>
              </motion.div>
              
              <div 
                className="h-[600px] w-full rounded-xl border border-slate-200/50 dark:border-slate-700/50 scrollbar-custom select-none relative z-10 overflow-auto"
                onContextMenu={(e) => e.preventDefault()}
                onCopy={(e) => e.preventDefault()} 
                onCut={(e) => e.preventDefault()}
              >
                <Table className="select-none w-max min-w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Identifikator</TableHead>
                      <TableHead className="min-w-[250px]">Naslov</TableHead>
                      <TableHead className="min-w-[100px]">Razina</TableHead>
                      <TableHead className="min-w-[120px]">VisaID</TableHead>
                      <TableHead className="min-w-[100px]">Redoslijed</TableHead>
                      <TableHead className="min-w-[100px]">VrijemeOd</TableHead>
                      <TableHead className="min-w-[100px]">VrijemeDo</TableHead>
                      <TableHead className="min-w-[300px]">Sadrzaj</TableHead>
                      <TableHead className="min-w-[200px]">Napomena</TableHead>
                      <TableHead className="min-w-[120px]">Količina</TableHead>
                      <TableHead className="min-w-[150px]">Broj tehničke jedinice</TableHead>
                      <TableHead className="min-w-[100px]">Jezik1</TableHead>
                      <TableHead className="min-w-[100px]">Jezik2</TableHead>
                      <TableHead className="min-w-[100px]">Pismo1</TableHead>
                      <TableHead className="min-w-[100px]">Pismo2</TableHead>
                      <TableHead className="min-w-[150px]">VrstaGradje</TableHead>
                      <TableHead className="min-w-[150px]">VrstaZapisa</TableHead>
                      <TableHead className="min-w-[150px]">VrstaSadrzaja</TableHead>
                      <TableHead className="min-w-[120px]">Institucija</TableHead>
                      <TableHead className="min-w-[120px]">StatusZapisa</TableHead>
                      <TableHead className="min-w-[120px]">ZaObjavu</TableHead>
                      <TableHead className="min-w-[200px]">Uvjeti koristenja</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extractedData.map((record, index) => (
                      <motion.tr
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                        className={`border-b border-slate-100 dark:border-slate-800 ${
                          loading && index === extractedData.length - 1 ? "bg-slate-100/50 dark:bg-slate-800/30" : ""
                        } ${index >= 10 ? "blur-sm opacity-40 pointer-events-none" : ""}`}
                      >
                        <TableCell
                          className={`font-mono text-xs transition-all duration-300 ${
                            record.identifikator
                              ? "bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-950/30 dark:to-transparent"
                              : "bg-slate-50/50 dark:bg-slate-900/50"
                          }`}
                        >
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            {record.identifikator || (loading && index === extractedData.length - 1 ? "..." : "")}
                          </motion.span>
                        </TableCell>
                        {[
                          { key: 'naslov', value: record.naslov, className: '' },
                          { key: 'razina', value: record.razina, className: '' },
                          { key: 'visaID', value: record.visaID, className: 'font-mono text-xs' },
                          { key: 'redoslijed', value: record.redoslijed, className: '' },
                          { key: 'vrijemeOd', value: record.vrijemeOd, className: '' },
                          { key: 'vrijemeDo', value: record.vrijemeDo, className: '' },
                          { key: 'sadrzaj', value: record.sadrzaj, className: 'text-sm' },
                          { key: 'napomena', value: record.napomena, className: 'text-sm' },
                          { key: 'kolicina', value: record.kolicina, className: '' },
                          { key: 'brojTehnickeJedinice', value: record.brojTehnickeJedinice, className: '' },
                          { key: 'jezik1', value: record.jezik1, className: '' },
                          { key: 'jezik2', value: record.jezik2, className: '' },
                          { key: 'pismo1', value: record.pismo1, className: '' },
                          { key: 'pismo2', value: record.pismo2, className: '' },
                          { key: 'vrstaGradje', value: record.vrstaGradje, className: '' },
                          { key: 'vrstaZapisa', value: record.vrstaZapisa, className: '' },
                          { key: 'vrstaSadrzaja', value: record.vrstaSadrzaja, className: '' },
                          { key: 'institucija', value: record.institucija, className: '' },
                          { key: 'statusZapisa', value: record.statusZapisa, className: '' },
                          { key: 'zaObjavu', value: record.zaObjavu, className: '' },
                          { key: 'uvjetiKoristenja', value: record.uvjetiKoristenja, className: 'text-sm' },
                        ].map((cell, cellIndex) => (
                          <TableCell
                            key={cell.key}
                            className={`${cell.className} transition-all duration-300 ${
                              cell.value
                                ? "bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-950/30 dark:to-transparent"
                                : "bg-slate-50/50 dark:bg-slate-900/50"
                            }`}
                          >
                            <motion.span
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: cellIndex * 0.02, duration: 0.2 }}
                            >
                              {cell.value || (loading && index === extractedData.length - 1 ? (
                                <motion.span
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                >
                                  ...
                                </motion.span>
                              ) : "")}
                            </motion.span>
                          </TableCell>
                        ))}
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Demo Limitation Overlay */}
              {extractedData.length > 10 && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20"
                >
                  <div className="bg-slate-900 dark:bg-slate-800 text-white px-6 py-3 rounded-lg shadow-2xl border border-slate-700 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        🔒 Demo Mode: Showing {Math.min(extractedData.length, 15)} records (First 10 clear, {Math.max(0, Math.min(extractedData.length - 10, 5))} blurred)
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
