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
        // Auto-logout after 1 hour
        setTimeout(() => {
          setIsAuthenticated(false)
          setLoginError("Session expired. Please login again.")
        }, 60 * 60 * 1000)
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
                      setExtractedData(records as ArchivalRecord[])
                      
                      // Log less frequently to avoid console spam
                      if (messageCount % 20 === 0) {
                        console.log(`[Client] Update ${messageCount}: ${records.length} records, ${message.content.length} chars`)
                      }
                    }
                  } else if (message.type === "complete") {
                    // Final complete data
                    console.log(`[Client] Received complete data: ${message.records?.length || 0} records`)
                    setExtractedData(message.records || [])
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
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-slate-900 dark:via-amber-950 dark:to-orange-950 relative overflow-hidden flex items-center justify-center">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -top-40 -right-40 w-80 h-80 bg-amber-200/20 dark:bg-amber-700/10 rounded-full blur-3xl"
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
            className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-200/20 dark:bg-orange-700/10 rounded-full blur-3xl"
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
          
          {/* Floating Icons */}
          <motion.div
            className="absolute top-[10%] left-[5%] w-44 h-44 opacity-50 dark:opacity-30"
            animate={{
              y: [0, -30, 0],
              rotate: [0, 10, -10, 0],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Image src="/icons/konverzija.png" alt="" width={176} height={176} className="w-full h-full object-contain" />
          </motion.div>
          
          <motion.div
            className="absolute top-[20%] right-[8%] w-56 h-56 opacity-50 dark:opacity-30"
            animate={{
              y: [0, 40, 0],
              rotate: [0, -15, 15, 0],
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          >
            <Image src="/icons/tablica.png" alt="" width={224} height={224} className="w-full h-full object-contain" />
          </motion.div>
          
          <motion.div
            className="absolute bottom-[15%] left-[12%] w-64 h-64 opacity-50 dark:opacity-30"
            animate={{
              y: [0, -35, 0],
              x: [0, 20, 0],
              rotate: [0, 20, 0],
            }}
            transition={{
              duration: 18,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2,
            }}
          >
            <Image src="/icons/spis.png" alt="" width={256} height={256} className="w-full h-full object-contain" />
          </motion.div>
          
          <motion.div
            className="absolute top-[60%] right-[15%] w-44 h-44 opacity-50 dark:opacity-30"
            animate={{
              y: [0, 25, 0],
              x: [0, -15, 0],
            }}
            transition={{
              duration: 14,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 3,
            }}
          >
            <Image src="/icons/konverzija.png" alt="" width={176} height={176} className="w-full h-full object-contain" />
          </motion.div>
          
          <motion.div
            className="absolute bottom-[25%] right-[5%] w-52 h-52 opacity-50 dark:opacity-30"
            animate={{
              y: [0, -40, 0],
              rotate: [0, -10, 10, 0],
            }}
            transition={{
              duration: 16,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 4,
            }}
          >
            <Image src="/icons/tablica.png" alt="" width={208} height={208} className="w-full h-full object-contain" />
          </motion.div>
        </div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 w-full max-w-md mx-4"
        >
          <Card className="border-amber-200/50 dark:border-amber-800/50 shadow-2xl backdrop-blur-sm bg-white/95 dark:bg-slate-900/95">
            <CardHeader className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                className="flex justify-center"
              >
                <Image 
                  src="/data-transformation.png" 
                  alt="Državni Arhiv u Varaždinu" 
                  width={150}
                  height={150}
                  className="w-60 h-60"
                  priority
                />
              </motion.div>
              <div>
                <CardTitle                 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-900 via-orange-800 to-rose-900 dark:from-amber-100 dark:via-orange-200 dark:to-rose-100">
                  Državni Arhiv u Varaždinu
                </CardTitle>
                <CardDescription className="mt-2 text-base">
                  AI obrada arhivskih inventara
                </CardDescription>
              </div>
              
              {/* App Description */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-left space-y-3"
              >
                <p className="text-sm text-amber-900/80 dark:text-amber-200/90 leading-relaxed">
                  Digitalna obrada arhivskih inventara pomoću umjetne inteligencije. Alat automatski ekstrahira arhivske zapise prema hrvatskom arhivskom standardu, omogućavajući pretraživanje i izvoz podataka.
                </p>
                <div className="flex items-start gap-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                    <strong className="text-amber-900 dark:text-amber-200">Napomena:</strong> Alat ekstrahira sve zapise iz dokumenta. CSV export dostupan nakon obrade.
                  </p>
                </div>
              </motion.div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-amber-900 dark:text-amber-200 block mb-2">
                  Lozinka
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="Unesite lozinku"
                  className="w-full px-4 py-3 border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-none text-base"
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
                className="w-full bg-gradient-to-r from-amber-700 to-orange-800 hover:from-amber-800 hover:to-orange-900 text-white shadow-lg text-base py-6"
                size="lg"
              >
                <Lock className="mr-2 h-5 w-5" />
                Prijava
              </Button>

              <p className="text-xs text-amber-800/70 dark:text-amber-300/70 text-center">
                Sesija istječe nakon 1 sat od prijave
              </p>

              <div className="pt-4 border-t border-amber-200 dark:border-amber-800">
                <p className="text-xs text-center text-amber-900/80 dark:text-amber-200/80">
                  © Državni Arhiv u Varaždinu 2025
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-slate-900 dark:via-amber-950 dark:to-orange-950 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 bg-amber-200/20 dark:bg-amber-700/10 rounded-full blur-3xl"
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
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-200/20 dark:bg-orange-700/10 rounded-full blur-3xl"
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
        
        {/* Floating Icons */}
        <motion.div
          className="absolute top-[8%] left-[3%] w-56 h-56 opacity-50 dark:opacity-30"
          animate={{
            y: [0, -35, 0],
            rotate: [0, 12, -12, 0],
          }}
          transition={{
            duration: 13,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Image src="/icons/spis.png" alt="" width={224} height={224} className="w-full h-full object-contain" />
        </motion.div>
        
        <motion.div
          className="absolute top-[15%] right-[5%] w-64 h-64 opacity-50 dark:opacity-30"
          animate={{
            y: [0, 45, 0],
            rotate: [0, -18, 18, 0],
          }}
          transition={{
            duration: 17,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        >
          <Image src="/icons/konverzija.png" alt="" width={256} height={256} className="w-full h-full object-contain" />
        </motion.div>
        
        <motion.div
          className="absolute top-[50%] left-[2%] w-44 h-44 opacity-50 dark:opacity-30"
          animate={{
            y: [0, -30, 0],
            x: [0, 15, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2,
          }}
        >
          <Image src="/icons/tablica.png" alt="" width={176} height={176} className="w-full h-full object-contain" />
        </motion.div>
        
        <motion.div
          className="absolute bottom-[20%] left-[8%] w-52 h-52 opacity-50 dark:opacity-30"
          animate={{
            y: [0, 30, 0],
            rotate: [0, 15, 0],
          }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 3,
          }}
        >
          <Image src="/icons/konverzija.png" alt="" width={208} height={208} className="w-full h-full object-contain" />
        </motion.div>
        
        <motion.div
          className="absolute top-[35%] right-[3%] w-60 h-60 opacity-50 dark:opacity-30"
          animate={{
            y: [0, -25, 0],
            x: [0, -20, 0],
            rotate: [0, -12, 12, 0],
          }}
          transition={{
            duration: 16,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 4,
          }}
        >
          <Image src="/icons/spis.png" alt="" width={240} height={240} className="w-full h-full object-contain" />
        </motion.div>
        
        <motion.div
          className="absolute bottom-[10%] right-[10%] w-56 h-56 opacity-50 dark:opacity-30"
          animate={{
            y: [0, -40, 0],
            rotate: [0, 20, -20, 0],
          }}
          transition={{
            duration: 19,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 5,
          }}
        >
          <Image src="/icons/tablica.png" alt="" width={224} height={224} className="w-full h-full object-contain" />
        </motion.div>
        
        <motion.div
          className="absolute top-[70%] left-[15%] w-44 h-44 opacity-50 dark:opacity-30"
          animate={{
            y: [0, 28, 0],
            x: [0, 12, 0],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1.5,
          }}
        >
          <Image src="/icons/konverzija.png" alt="" width={176} height={176} className="w-full h-full object-contain" />
        </motion.div>
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
              alt="Državni Arhiv u Varaždinu" 
              width={224}
              height={224} 
              className="w-24 h-24 md:w-28 md:h-28"
              priority
            />
          </motion.div>
          
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.25, type: "spring", stiffness: 200 }}
            className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 rounded-full border border-amber-200 dark:border-amber-800"
          >
            <Sparkles className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
              AI Obrada Inventara
            </span>
          </motion.div>
          
          <div className="flex items-center justify-center gap-4 mb-4">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="text-4xl md:text-5xl font-bold text-balance bg-clip-text text-transparent bg-gradient-to-r from-amber-900 via-orange-800 to-rose-900 dark:from-amber-100 dark:via-orange-200 dark:to-rose-100"
            >
              Državni Arhiv u Varaždinu
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
            className="text-lg md:text-xl text-amber-900/80 dark:text-amber-200/90 text-pretty max-w-2xl mx-auto mb-6"
          >
            Digitalna obrada arhivskih inventara uz pomoć umjetne inteligencije
          </motion.p>
          
          {/* Feature Highlights */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-4 text-sm text-amber-800 dark:text-amber-300"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Obrada u Stvarnom Vremenu</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Hrvatski Standard</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span>CSV Export</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Podrška za PDF, DOC, DOCX</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Sample Documents Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <Card className="mb-6 border-amber-200/50 dark:border-amber-800/50 shadow-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Isprobajte Primjer Dokumenta
              </CardTitle>
              <CardDescription>Kliknite za učitavanje i obradu primjera arhivskog inventara</CardDescription>
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
          <Card className="mb-8 border-amber-200/50 dark:border-amber-800/50 shadow-xl backdrop-blur-sm bg-white/95 dark:bg-slate-900/95 overflow-hidden">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-rose-500/5"
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
                Učitajte Dokument
              </CardTitle>
              <CardDescription className="text-base">Podržani formati: PDF, TXT, DOC, DOCX</CardDescription>
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="mt-3 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg"
              >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    <strong>Napomena:</strong> Alat ekstrahira sve zapise iz dokumenta
                  </p>
              </motion.div>
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
                          "Kliknite za učitavanje ili povucite datoteku"
                        )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">PDF, TXT, DOC ili DOCX do 10MB</p>
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
                    className="w-full bg-gradient-to-r from-amber-700 to-orange-800 hover:from-amber-800 hover:to-orange-900 text-white shadow-lg border border-amber-600"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {extractedData.length > 0
                          ? `Obrada... ${extractedData.length} zapis${extractedData.length !== 1 ? "a" : ""} pronađeno`
                          : "Obrada u tijeku..."}
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-5 w-5" />
                        Obradi Dokument
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
              <Card className="border-amber-200/50 dark:border-amber-800/50 shadow-2xl backdrop-blur-sm bg-white/95 dark:bg-slate-900/95 overflow-hidden">
                <motion.div
                  className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600"
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
                        Ekstrahirani Zapisi
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
                            Obrada Uživo
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
                        zapis{extractedData.length !== 1 ? "a" : ""} ekstrahirano
                        {loading && " (ažuriranje u stvarnom vremenu...)"}
                      </CardDescription>
                    </div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center gap-2">
                        <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          CSV Export Dostupan
                        </span>
                      </div>
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
                    Gemini 2.5 Flash Lite
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
          <div className="text-sm text-amber-900/80 dark:text-amber-200/80">
            <p className="flex items-center justify-center gap-2">
              <span>©</span>
              <span className="font-semibold">
                Državni Arhiv u Varaždinu
              </span>
              <span>2025</span>
            </p>
            <p className="mt-2 text-xs">
              AI obrada arhivskih inventara • Gemini 2.5 Flash Lite • Obrada u stvarnom vremenu
            </p>
          </div>
        </motion.footer>
      </div>
    </div>
  )
}
