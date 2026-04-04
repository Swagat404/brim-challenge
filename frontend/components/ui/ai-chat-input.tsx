"use client"

import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { Lightbulb, Mic, Paperclip, Send, Loader2 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

interface AIChatInputProps {
  placeholders?: string[]
  onSend?: (text: string) => void
  disabled?: boolean
  loading?: boolean
}

const DEFAULT_PLACEHOLDERS = [
  "What did marketing spend on software last quarter?",
  "Compare spending across all departments",
  "Find employees who are over budget",
  "Show fuel spend trends by month",
  "Generate an expense report for recent travel",
  "Which transactions violate our expense policy?",
]

const AIChatInput = ({
  placeholders = DEFAULT_PLACEHOLDERS,
  onSend,
  disabled = false,
  loading = false,
}: AIChatInputProps) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  const [isActive, setIsActive] = useState(false)
  const [thinkActive, setThinkActive] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActive || inputValue) return

    const interval = setInterval(() => {
      setShowPlaceholder(false)
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % placeholders.length)
        setShowPlaceholder(true)
      }, 400)
    }, 3000)

    return () => clearInterval(interval)
  }, [isActive, inputValue, placeholders.length])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        if (!inputValue) setIsActive(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [inputValue])

  const handleActivate = () => setIsActive(true)

  function handleSubmit() {
    if (!inputValue.trim() || disabled || loading) return
    onSend?.(inputValue.trim())
    setInputValue("")
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const containerVariants = {
    collapsed: {
      height: 64,
      boxShadow: "0 1px 4px 0 rgba(0,0,0,0.06)",
      transition: { type: "spring" as const, stiffness: 120, damping: 18 },
    },
    expanded: {
      height: 120,
      boxShadow: "0 4px 24px 0 rgba(0,0,0,0.10)",
      transition: { type: "spring" as const, stiffness: 120, damping: 18 },
    },
  }

  const placeholderContainerVariants = {
    initial: {},
    animate: { transition: { staggerChildren: 0.025 } },
    exit: { transition: { staggerChildren: 0.015, staggerDirection: -1 } },
  }

  const letterVariants = {
    initial: { opacity: 0, filter: "blur(12px)", y: 10 },
    animate: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: {
        opacity: { duration: 0.25 },
        filter: { duration: 0.4 },
        y: { type: "spring" as const, stiffness: 80, damping: 20 },
      },
    },
    exit: {
      opacity: 0,
      filter: "blur(12px)",
      y: -10,
      transition: {
        opacity: { duration: 0.2 },
        filter: { duration: 0.3 },
        y: { type: "spring" as const, stiffness: 80, damping: 20 },
      },
    },
  }

  return (
    <motion.div
      ref={wrapperRef}
      className="w-full max-w-3xl mx-auto"
      variants={containerVariants}
      animate={isActive || inputValue ? "expanded" : "collapsed"}
      initial="collapsed"
      style={{
        overflow: "hidden",
        borderRadius: 24,
        background: "#fff",
        border: "1px solid #e2e8f0",
      }}
      onClick={handleActivate}
    >
      <div className="flex flex-col items-stretch w-full h-full">
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <button
            className="p-2 rounded-full hover:bg-slate-100 transition text-slate-400"
            title="Attach file"
            type="button"
            tabIndex={-1}
          >
            <Paperclip size={18} />
          </button>

          <div className="relative flex-1">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 border-0 outline-0 rounded-md py-2 text-sm bg-transparent w-full font-normal text-slate-900"
              style={{ position: "relative", zIndex: 1 }}
              onFocus={handleActivate}
            />
            <div className="absolute left-0 top-0 w-full h-full pointer-events-none flex items-center py-2">
              <AnimatePresence mode="wait">
                {showPlaceholder && !isActive && !inputValue && (
                  <motion.span
                    key={placeholderIndex}
                    className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 select-none pointer-events-none text-sm"
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      zIndex: 0,
                    }}
                    variants={placeholderContainerVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {placeholders[placeholderIndex]
                      .split("")
                      .map((char, i) => (
                        <motion.span
                          key={i}
                          variants={letterVariants}
                          style={{ display: "inline-block" }}
                        >
                          {char === " " ? "\u00A0" : char}
                        </motion.span>
                      ))}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          <button
            className="p-2 rounded-full hover:bg-slate-100 transition text-slate-400"
            title="Voice input"
            type="button"
            tabIndex={-1}
          >
            <Mic size={18} />
          </button>
          <button
            className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 text-white p-2.5 rounded-full font-medium justify-center transition-colors"
            title="Send"
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              handleSubmit()
            }}
            disabled={!inputValue.trim() || disabled || loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>

        <motion.div
          className="w-full flex justify-start px-4 items-center text-sm"
          variants={{
            hidden: {
              opacity: 0,
              y: 16,
              pointerEvents: "none" as const,
              transition: { duration: 0.2 },
            },
            visible: {
              opacity: 1,
              y: 0,
              pointerEvents: "auto" as const,
              transition: { duration: 0.3, delay: 0.06 },
            },
          }}
          initial="hidden"
          animate={isActive || inputValue ? "visible" : "hidden"}
          style={{ marginTop: 4 }}
        >
          <div className="flex gap-2 items-center">
            <button
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all font-medium text-xs group ${
                thinkActive
                  ? "bg-green-100 ring-1 ring-green-400 text-green-800"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              title="Deep analysis mode"
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setThinkActive((a) => !a)
              }}
            >
              <Lightbulb
                className="group-hover:fill-yellow-300 transition-all"
                size={14}
              />
              Deep Analysis
            </button>

            <span className="text-[11px] text-slate-400">
              Shift+Enter for new line
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

export { AIChatInput }
