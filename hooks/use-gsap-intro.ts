"use client";

import { useEffect, useRef } from "react";

function splitWords(el: HTMLElement): HTMLElement[] {
  type Token = { t: "s"; v: string } | { t: "w"; v: string } | { t: "el"; v: Element };

  const tokens: Token[] = [];
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      (node.textContent ?? "").split(/(\s+)/).forEach((piece) => {
        if (piece === "") return;
        tokens.push(/^\s+$/.test(piece) ? { t: "s", v: piece } : { t: "w", v: piece });
      });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      tokens.push({ t: "el", v: node as Element });
    }
  });

  const frag = document.createDocumentFragment();
  const spans: HTMLElement[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === "s") {
      frag.appendChild(document.createTextNode(tk.v));
      continue;
    }
    const span = document.createElement("span");
    span.className = "gsap-w";
    if (tk.t === "w") {
      span.textContent = tk.v;
    } else {
      span.appendChild(tk.v);
    }
    const nx = tokens[i + 1];
    if (nx && nx.t === "w" && /^[,.;:!?…)\]]/.test(nx.v)) {
      span.appendChild(document.createTextNode(nx.v));
      i++;
    }
    frag.appendChild(span);
    spans.push(span);
  }

  el.textContent = "";
  el.appendChild(frag);
  return spans;
}

export function useGsapIntro(locale: string) {
  // Tracks whether the initial mount has passed so the locale effect skips it.
  const mounted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let ctx: { revert(): void } | null = null;

    import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const h1 = document.querySelector<HTMLElement>("[data-gsap-h1]");
      if (!h1) return;

      ctx = gsap.context(() => {
        const words = splitWords(h1);

        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

        tl.from("[data-nav]", { y: -16, autoAlpha: 0, duration: 0.55 }, 0)
          .from("[data-eyebrow]", { y: 12, autoAlpha: 0, duration: 0.45 }, 0.1)
          .from(
            words,
            {
              y: 34,
              autoAlpha: 0,
              duration: 0.7,
              stagger: 0.045,
              onComplete: () => words.forEach((w) => (w.style.willChange = "auto")),
            },
            0.22,
          )
          .from("[data-lede]", { y: 18, autoAlpha: 0, duration: 0.55 }, 0.55)
          .from("[data-urlbar]", { y: 22, autoAlpha: 0, duration: 0.6 }, 0.7)
          .from("[data-url-hint]", { autoAlpha: 0, duration: 0.5 }, 0.9)
          // Card headers slide in after the hero sequence — no ScrollTrigger
          // needed because the cards are visible on page load and ScrollTrigger
          // was the source of the stuck-opacity bug (cleanup races with play).
          .from("[data-card-head]", { x: -22, autoAlpha: 0, duration: 0.55, stagger: 0.08 }, 1.1)
          .from(
            "[data-step-num]",
            { scale: 0.4, rotate: -12, duration: 0.5, ease: "back.out(2.2)", stagger: 0.08 },
            1.2,
          )
          .from("[data-card-sub]", { autoAlpha: 0, duration: 0.45, stagger: 0.08 }, 1.3);
      });

      const totalDur = 1.3 + 0.45 + 0.1;
      document.body.classList.add("anim-ready");
      setTimeout(() => document.body.classList.add("anim-done"), totalDur * 1000 + 200);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    import("gsap").then(({ gsap }) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const h1 = document.querySelector<HTMLElement>("[data-gsap-h1]");
      const lede = document.querySelector<HTMLElement>("[data-lede]");
      const targets = [h1, lede].filter(Boolean) as HTMLElement[];
      if (!targets.length) return;
      // Animate as whole elements — avoids DOM mutation that breaks React reconciliation
      gsap.fromTo(
        targets,
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.08, ease: "power3.out" },
      );
    });
  }, [locale]);
}
