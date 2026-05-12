<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Overview

This application helps users calculate the cheapest way to purchase Steam games using either:

- Steam Wallet funds obtained from selling Team Fortress 2 (TF2) keys on the Steam Marketplace
- Direct game gifting services

Steam Marketplace transactions include taxes and fees (usually around 15%–20%).  
For example:

- A TF2 key may be listed for `64,000 VND`
- After Steam Marketplace fees, the seller only receives around `55,500 VND` in Steam Wallet balance

Because of this difference, users often compare:

1. Buying TF2 keys and selling them on the marketplace
2. Purchasing games through gifting services

Depending on market conditions, either method may be cheaper.

The application should automatically calculate and compare both methods so users can determine the most cost-effective option.

TF2 key prices can be fetched from the Steam API.

---

## Goal

Build a minimal, clean, and expandable application focused on:

- Simplicity
- Fast workflow
- Accurate calculations
- Easy future expansion
- Good user experience without unnecessary complexity

This project is mainly for personal use, but it should still be production-quality and usable by others.

---

## Core Workflow

1. User enters a Steam game URL  
   Example:

   ```txt
   https://store.steampowered.com/app/1551360/Forza_Horizon_5/
   ```

2. The application extracts the Steam App ID

3. Fetch game prices from Steam across multiple supported regions/currencies

4. Fetch current TF2 key marketplace prices from Steam API

5. Calculate:
   - Estimated Steam Wallet value after marketplace tax
   - Number of TF2 keys required
   - Effective real-world cost
   - Comparison against gifting service pricing

6. Display the cheapest purchase method clearly

---

## Technical Requirements

### Stack

- Next.js 16
- Tailwind CSS
- Shadcn UI
- TanStack Query
- Axios
- Prettier
- GSAP (optional, only if animation meaningfully improves UX)

### Backend Rules

- Use Next.js API Routes for all server-side logic
- Keep API logic modular and reusable
- Avoid unnecessary abstractions
- Prefer simple and maintainable solutions

### Frontend Rules

- UI should be minimal and responsive
- Prioritize usability over visual complexity
- Avoid cluttered layouts
- Components should be reusable and scalable

---

## Development Rules

### Before Coding

- Always ask clarifying questions before starting complex tasks
- Show implementation plan before writing code
- Explain important architectural decisions

### Code Quality

- Review code carefully before moving to the next step
- Ensure there are no TypeScript, ESLint, or runtime errors
- Avoid overengineering
- Write readable and maintainable code
- Keep files organized and scalable

### Dependencies

- Do not install additional libraries unless necessary
- Always ask before introducing new dependencies

---

## Preferred Development Style

The project owner prefers:

- Minimalist design
- Simple workflows
- Fast iteration
- Clean architecture
- Reusable code
- Low maintenance complexity

Avoid generating bloated enterprise-style code unless explicitly requested.