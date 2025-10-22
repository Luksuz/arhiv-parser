"use client"

import type React from "react"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, FileText, Loader2, Download, Sparkles, CheckCircle2, Lock, LogOut, Shield } from "lucide-react"
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
  const [processingTime, setProcessingTime] = useState<number | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [columnDensity, setColumnDensity] = useState<"comfortable" | "compact">("comfortable")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState<string | null>(null)

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

  // Fuzzy search function
  const fuzzySearch = (records: ArchivalRecord[], query: string) => {
    if (!query.trim()) return records
    
    const lowerQuery = query.toLowerCase()
    return records.filter(record => {
      const searchableText = Object.values(record).join(" ").toLowerCase()
      return searchableText.includes(lowerQuery)
    })
  }

  // Login functions
  const handleLogin = async () => {
    try {
      setLoginError(null)
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: loginPassword }),
      })

      const data = await response.json()

      if (data.success) {
        setIsAuthenticated(true)
        setLoginPassword("")
        // Auto-logout after 5 minutes
        setTimeout(() => {
          setIsAuthenticated(false)
          setLoginError("Session expired. Please login again.")
        }, 5 * 60 * 1000)
      } else {
        setLoginError("Invalid password")
      }
    } catch (err) {
      setLoginError("Login failed")
    }
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/login", { method: "DELETE" })
      setIsAuthenticated(false)
      setExtractedData([])
      setFile(null)
    } catch (err) {
      console.error("Logout failed", err)
    }
  }

  // Load sample document
  const loadSampleDocument = async (filename: string) => {
    try {
      setError(null)
      setExtractedData([])
      
      const response = await fetch(`/${filename}`)
      if (!response.ok) {
        throw new Error("Failed to fetch sample document")
      }
      
      const blob = await response.blob()
      const sampleFile = new File([blob], filename, { 
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
      })
      setFile(sampleFile)
      
      // Directly process the file
      processFile(sampleFile)
    } catch (err) {
      setError(`Failed to load sample document: ${err instanceof Error ? err.message : "Unknown error"}`)
      setLoading(false)
    }
  }

  const processFile = async (fileToProcess: File) => {
    setLoading(true)
    setError(null)
    setExtractedData([]) // Clear previous results
    setProcessingTime(null)
    setStartTime(Date.now())

    try {
      // Convert file to base64
      const reader = new FileReader()
      reader.readAsDataURL(fileToProcess)

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
                mediaType: fileToProcess.type || "application/octet-stream",
                filename: fileToProcess.name,
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
                    if (startTime) {
                      setProcessingTime((Date.now() - startTime) / 1000)
                    }
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

  const handleUpload = async () => {
    if (!file) return
    processFile(file)
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

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-black dark:via-slate-950 dark:to-slate-900 relative overflow-hidden flex items-center justify-center">
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

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 w-full max-w-md mx-4"
        >
          <Card className="border-slate-300/50 dark:border-slate-700/50 shadow-2xl backdrop-blur-sm bg-white/90 dark:bg-slate-900/90">
            <CardHeader className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                className="flex justify-center"
              >
                <Image 
                  src="/data-transformation.png" 
                  alt="Arhiv Parser" 
                  width={80}
                  height={80}
                  className="w-20 h-20"
                  priority
                />
              </motion.div>
              <div>
                <CardTitle className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-gray-800 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white">
                  Arhiv Parser
                </CardTitle>
                <CardDescription className="mt-2 text-base">
                  AI-powered archival document extraction
                </CardDescription>
              </div>
              
              {/* App Description */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-left"
              >
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Transform unstructured archival documents into organized, structured data. Our AI analyzes and extracts Croatian archival records following standard schemas, making historical data searchable and exportable.
                </p>
              </motion.div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="Enter password"
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-slate-400 focus:outline-none text-base"
                  autoFocus
                />
              </div>

              {loginError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                >
                  <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p>
                </motion.div>
              )}

              <Button
                onClick={handleLogin}
                className="w-full bg-gradient-to-r from-slate-800 to-gray-900 hover:from-slate-900 hover:to-black text-white shadow-lg text-base py-6"
                size="lg"
              >
                <Lock className="mr-2 h-5 w-5" />
                Login
              </Button>

              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Session expires after 20 minutes of login
              </p>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-center text-slate-600 dark:text-slate-400">
                  Demo built by{" "}
                  <a
                    href="https://mindxglobal.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                  >
                    MindX Global
                  </a>{" "}
                  🖤
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
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
          {/* App Icon and Title */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mb-6 flex justify-center"
          >
            <Image 
              src="/data-transformation.png" 
              alt="Arhiv Parser" 
              width={112}
              height={112}
              className="w-24 h-24 md:w-28 md:h-28"
              priority
            />
          </motion.div>
          
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.25, type: "spring", stiffness: 200 }}
            className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-slate-200 dark:bg-slate-800/50 rounded-full border border-slate-300 dark:border-slate-700"
          >
            <Sparkles className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              AI-Powered Extraction
            </span>
          </motion.div>
          
          <div className="flex items-center justify-center gap-4 mb-4">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="text-5xl md:text-6xl font-bold text-balance bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-gray-800 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white"
            >
              Arhiv Parser
            </motion.h1>
            
            {/* Logout Button */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="gap-2 border-slate-600 text-slate-600 hover:bg-slate-50 dark:border-slate-400 dark:text-slate-400 dark:hover:bg-slate-800"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </motion.div>
          </div>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-lg md:text-xl text-slate-600 dark:text-slate-400 text-pretty max-w-2xl mx-auto mb-6"
          >
            Transform archival documents into structured, searchable data with AI-powered extraction
          </motion.p>
          
          {/* Feature Highlights */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-600 dark:text-slate-400"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Real-time Streaming</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Croatian Standards</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span>CSV Export</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Multi-format Support</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Sample Documents Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <Card className="mb-6 border-slate-300/50 dark:border-slate-700/50 shadow-lg bg-white/90 dark:bg-slate-900/90">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Try a Sample Document
              </CardTitle>
              <CardDescription>Click to load and process an example archival document</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-2"
                    onClick={() => loadSampleDocument("222. Sudbeni stol Varaždin - AP.docx")}
                    disabled={loading}
                  >
                    <FileText className="h-4 w-4" />
                    <div className="text-left">
                      <div className="font-medium">Sudbeni stol Varaždin</div>
                      <div className="text-xs text-slate-500">Archival Protocol</div>
                    </div>
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-2"
                    onClick={() => loadSampleDocument("228.KRALJEVSKI KOTARSKI SUD VARAŽDIN.doc")}
                    disabled={loading}
                  >
                    <FileText className="h-4 w-4" />
                    <div className="text-left">
                      <div className="font-medium">Kraljevski Kotarski Sud</div>
                      <div className="text-xs text-slate-500">Royal District Court</div>
                    </div>
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-2"
                    onClick={() => loadSampleDocument("69. NOO Jalžabet SI.docx")}
                    disabled={loading}
                  >
                    <FileText className="h-4 w-4" />
                    <div className="text-left">
                      <div className="font-medium">NOO Jalžabet</div>
                      <div className="text-xs text-slate-500">National Liberation Committee</div>
                    </div>
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-2"
                    onClick={() => loadSampleDocument("48 -OBITELJ KAVANAGH(1809. – 1940.)-SI.docx")}
                    disabled={loading}
                  >
                    <FileText className="h-4 w-4" />
                    <div className="text-left">
                      <div className="font-medium">Obitelj Kavanagh</div>
                      <div className="text-xs text-slate-500">Family Archive 1809-1940</div>
                    </div>
                  </Button>
                </motion.div>
              </div>
            </CardContent>
          </Card>
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
                      </CardDescription>
                    </div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Button
                        onClick={exportToCSV}
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        className="gap-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-400"
                      >
                        <Download className="h-4 w-4" />
                        Export CSV
                      </Button>
                    </motion.div>
                  </div>
                </CardHeader>
            
            {/* Document Info Card */}
            <div className="px-6 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Document</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate" title={file?.name}>
                    {file?.name || "—"}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Size</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : "—"}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Processed</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {processingTime ? `${(processingTime / 1000).toFixed(1)}s` : loading ? "..." : "—"}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Model</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    GPT-5-Mini
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Fields Complete</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {extractedData.length > 0 
                      ? `${Math.round((extractedData.filter(r => r.identifikator).length / extractedData.length) * 100)}%`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Search Bar & Controls */}
            <div className="px-6 pb-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Search records by ID, title, content..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-slate-400 focus:outline-none"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7"
                      onClick={() => setSearchQuery("")}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setColumnDensity(columnDensity === "comfortable" ? "compact" : "comfortable")}
                  className="gap-2"
                >
                  <span className="text-xs">
                    {columnDensity === "comfortable" ? "Compact" : "Comfortable"}
                  </span>
                </Button>
              </div>
              {searchQuery && (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Found {fuzzySearch(extractedData, searchQuery).length} of {extractedData.length} records
                </div>
              )}
            </div>

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
                    {fuzzySearch(extractedData, searchQuery).map((record, index) => {
                      const originalIndex = extractedData.indexOf(record)
                      return (
                      <motion.tr
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                        className={`border-b border-slate-100 dark:border-slate-800 ${
                          loading && originalIndex === extractedData.length - 1 ? "bg-slate-100/50 dark:bg-slate-800/30" : ""
                        }`}
                      >
                        <TableCell
                          className={`font-mono text-xs transition-all duration-300 ${
                            columnDensity === "compact" ? "py-2" : "py-3"
                          } ${
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
                            {record.identifikator || (loading && originalIndex === extractedData.length - 1 ? "..." : "")}
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
                              columnDensity === "compact" ? "py-2" : "py-3"
                            } ${
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
                              {cell.value || (loading && originalIndex === extractedData.length - 1 ? (
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
                    )})}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
          )}
        </AnimatePresence>


        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="mt-16 pb-8 text-center"
        >
          <div className="text-sm text-slate-600 dark:text-slate-400">
            <p className="flex items-center justify-center gap-2">
              <span>Demo built by</span>
              <a 
                href="https://mindxglobal.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-semibold hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                MindX Global
              </a>
              <span>🖤</span>
            </p>
            <p className="mt-2 text-xs">
              Powered by GPT-5-Mini • Real-time streaming extraction • Demo version
            </p>
          </div>
        </motion.footer>
      </div>
    </div>
  )
}
