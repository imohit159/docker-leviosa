'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Gauge, Network, Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { LOCAL_HOST_ID, Route } from '@/lib/constants';
import { BrandMark } from '@/components/ui/brand-mark';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { GlowingBadge } from '@/components/unlumen-ui/glowing-badge';
import { Fade } from '@/components/unlumen-ui/primitives/effects/fade';
import { Shine } from '@/components/unlumen-ui/primitives/effects/shine';

/**
 * The landing page. Everything on it is a claim the dashboard can back up one click
 * later — no invented logos, no fabricated numbers. Marketing chrome is deliberately
 * separate from the app shell: this page sells the tool, `/volumes` is the tool.
 */

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
] as const;

const FEATURES: ReadonlyArray<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}> = [
  {
    icon: Gauge,
    title: 'Measure without mounting',
    description:
      'A throwaway sidecar container walks each volume and reports size, file counts and last write time — your running containers are never touched.',
  },
  {
    icon: Network,
    title: 'Trace every dependency',
    description:
      'Every volume is matched against live container references and compose projects, so "is anything using this?" has an answer instead of a guess.',
  },
  {
    icon: Trash2,
    title: 'Reclaim with confidence',
    description:
      'Orphans are ranked by reclaimable bytes and every volume carries a deletion verdict. Destroying data requires typing the volume\u2019s name.',
  },
];

const PIPELINE: ReadonlyArray<{
  step: string;
  title: string;
  description: string;
  badge: { tone: BadgeTone; label: string };
}> = [
  {
    step: '01',
    title: 'Scan',
    description:
      'Leviosa lists every volume on the daemon and measures contents inside a disposable container.',
    badge: { tone: 'ok', label: 'Non-invasive' },
  },
  {
    step: '02',
    title: 'Analyze',
    description:
      'Sizes, largest directories and write activity are recorded over time — Docker keeps no history of its own.',
    badge: { tone: 'brand', label: 'Tracked' },
  },
  {
    step: '03',
    title: 'Verdict',
    description:
      'Live container references decide whether each volume is in use, reserved by a stopped container, or orphaned.',
    badge: { tone: 'warn', label: 'Guarded' },
  },
  {
    step: '04',
    title: 'Reclaim',
    description:
      'Safe-to-delete orphans surface with their exact byte counts, so cleanup is a decision, not a gamble.',
    badge: { tone: 'ok', label: 'Your call' },
  },
];

function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <nav className="mx-auto flex h-13 max-w-4xl items-center justify-between rounded-full border border-border bg-card/85 pr-2 pl-4 shadow-xs backdrop-blur-md">
        <Link href={Route.LANDING} className="flex items-center gap-2">
          <BrandMark className="size-7" />
          <span className="text-sm font-semibold tracking-tight">Leviosa</span>
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <Shine enableOnHover className="rounded-full">
          <Button
            render={<Link href={Route.dashboard(LOCAL_HOST_ID)} />}
            nativeButton={false}
            className="rounded-full px-4"
          >
            Open dashboard
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        </Shine>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative px-4 pt-36 pb-16 sm:pt-44">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <Fade>
          <GlowingBadge variant="info">
            Local-first &middot; nothing leaves your machine
          </GlowingBadge>
        </Fade>

        <Fade delay={80}>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Know what&rsquo;s inside
            <span className="block text-brand">every Docker volume</span>
          </h1>
        </Fade>

        <Fade delay={160}>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground">
            Leviosa measures your volumes, traces which containers depend on them, and
            tells you exactly what is safe to delete — before{' '}
            <code className="identifier rounded bg-muted px-1.5 py-0.5 text-[13px]">
              docker volume rm
            </code>{' '}
            destroys something a database was counting on.
          </p>
        </Fade>

        <Fade delay={240} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Shine enableOnHover className="rounded-full">
            <Button
              size="lg"
              render={<Link href={Route.dashboard(LOCAL_HOST_ID)} />}
              nativeButton={false}
              className="rounded-full px-6"
            >
              Open dashboard
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </Shine>
          <Button
            size="lg"
            variant="outline"
            render={<a href="#how-it-works" />}
            nativeButton={false}
            className="rounded-full bg-card px-6"
          >
            How it works
          </Button>
        </Fade>
      </div>

      <Fade delay={320} inView inViewMargin="-40px">
        <div className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-lg shadow-brand/5">
          <Image
            src="/hero.png"
            alt="Shipping containers levitating over a calm ocean — volumes, weightless"
            width={1536}
            height={1024}
            priority
            className="h-auto w-full"
          />
        </div>
      </Fade>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-24 px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <Fade inView inViewMargin="-60px">
          <p className="text-center text-[11px] font-semibold tracking-widest text-brand uppercase">
            Features
          </p>
          <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Answers, not another list of names
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
            <code className="identifier">docker volume ls</code> tells you what exists.
            Leviosa tells you what it costs, who needs it, and what it would take to get
            the space back.
          </p>
        </Fade>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Fade key={feature.title} inView inViewMargin="-60px" delay={index * 90}>
              <article className="h-full rounded-2xl border border-border bg-card p-6 shadow-xs transition-shadow hover:shadow-md">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand-line ring-inset">
                  <feature.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            </Fade>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <Fade inView inViewMargin="-60px">
          <p className="text-center text-[11px] font-semibold tracking-widest text-brand uppercase">
            How it works
          </p>
          <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            From unknown blob to informed decision
          </h2>
        </Fade>

        <Fade inView inViewMargin="-60px" delay={120}>
          <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
            {PIPELINE.map((stage) => (
              <div
                key={stage.step}
                className="flex items-start gap-4 border-b border-border px-5 py-4 last:border-0"
              >
                <span className="numeric mt-0.5 text-xs font-semibold text-muted-foreground/70">
                  {stage.step}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold tracking-tight">{stage.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {stage.description}
                  </p>
                </div>
                <Badge tone={stage.badge.tone} className="mt-0.5 shrink-0">
                  {stage.badge.label}
                </Badge>
              </div>
            ))}
          </div>
        </Fade>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="px-4 py-16">
      <Fade inView inViewMargin="-60px">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-brand-line bg-brand-soft px-6 py-14 text-center">
          <div className="grid-noise pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="relative">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Your disk did not fill itself
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Point Leviosa at your daemon and find out which volume did it. No account,
              no telemetry, no cloud — it runs where your containers run.
            </p>
            <Shine enableOnHover className="mx-auto mt-7 w-fit rounded-full">
              <Button
                size="lg"
                render={<Link href={Route.dashboard(LOCAL_HOST_ID)} />}
                nativeButton={false}
                className="rounded-full px-6"
              >
                Open dashboard
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </Shine>
          </div>
        </div>
      </Fade>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-border px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>Leviosa — local-first Docker volume insight.</p>
        <Link
          href={Route.dashboard(LOCAL_HOST_ID)}
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        >
          Open dashboard
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <LandingNav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <ClosingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
