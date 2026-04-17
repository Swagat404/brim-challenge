"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CrystallineCube from "@/components/ui/crystalline-cube";

/**
 * /welcome — minimal product splash.
 *
 * Renders as a fixed fullscreen overlay so the surrounding sidebar/card
 * chrome from the root layout is hidden. Click "Try it out" to enter the
 * actual app at /.
 */
export default function WelcomePage() {
  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden font-sans">
      {/* WebGL background */}
      <CrystallineCube
        complexity={4.0}
        colorShift={0.12}
        lightIntensity={1.2}
        mouseInfluence={0.6}
      />

      {/* Soft dark scrim BEHIND the hero text — radial blob darkens the
          center where text sits, fading to transparent at the edges so the
          cube still feels alive in the periphery. Combined with a gentle
          top/bottom gradient for the brand and footer hint. */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,_rgba(0,0,0,0.55)_0%,_rgba(0,0,0,0.25)_55%,_transparent_85%)]" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/30 via-transparent to-black/45" />

      {/* Content layer */}
      <div className="relative z-10 h-full w-full flex flex-col">
        {/* Top brand + nav */}
        <header className="px-8 pt-7 sm:px-12 sm:pt-10 flex items-center justify-between">
          <Link href="/welcome" className="flex items-center gap-2">
            <Image
              src="/sift-logo.png"
              alt="Sift"
              width={36}
              height={36}
              priority
              className="w-9 h-9 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            />
            <span className="font-bold text-[18px] tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
              sift
            </span>
          </Link>
          <Link
            href="/docs"
            className="text-[12.5px] font-bold tracking-tight text-white/70 hover:text-white px-4 py-2 rounded-full hover:bg-white/10 transition-colors"
          >
            Docs →
          </Link>
        </header>

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6 -mt-6">
          <p className="text-[10.5px] sm:text-[11.5px] font-bold tracking-[0.36em] text-white/55 uppercase mb-6">
            AI Policy Agent
          </p>
          <h1 className="text-white font-bold tracking-tight leading-[0.92] text-[64px] sm:text-[96px] md:text-[124px] drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
            Spend,
            <br />
            sifted<span className="text-white/65">.</span>
          </h1>

          {/* The four capabilities, said as four verbs. No prose. */}
          <p className="mt-8 text-white/75 text-[13px] sm:text-[14.5px] font-bold tracking-[0.18em] uppercase drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
            Ask <span className="text-white/35 mx-2">·</span>
            Review <span className="text-white/35 mx-2">·</span>
            Approve <span className="text-white/35 mx-2">·</span>
            Report
          </p>

          <Link
            href="/"
            className="group mt-12 inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-white text-zinc-900 text-[14px] font-bold tracking-tight shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
          >
            Try it out
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </main>

      </div>
    </div>
  );
}
