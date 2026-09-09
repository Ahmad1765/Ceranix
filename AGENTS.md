# Antigravity Agent Guidelines (Ceranix / Carrinex)

## Mandatory UI Guardrails & Pre-Flight Protocol

Before suggesting, writing, or modifying ANY user interface, component, screen, or styling code in this repository:
1. **Read `UI_GUARDRAILS.md` first.**
2. **Perform Collision Detection:** Check whether the user's requested change conflicts with the protected rules in [UI_GUARDRAILS.md](file:///d:/Softwares/Ceranix/UI_GUARDRAILS.md).
3. **Hard-Stop on Collision:** If the request collides with protected invariants (e.g., using `className` on `<Pressable>`, breaking Inter font imports, introducing forbidden colors/gradients, removing safe-area bottom padding for the floating tab bar, or adding Depop-style badge clutter):
   - **Do NOT execute the breaking change.**
   - Warn the user about the collision and the exact risk of breakage.
   - Propose the safe, compliant alternative as specified in `UI_GUARDRAILS.md`.

## Core Technical Invariants at a Glance:
- **Never use `className` on `<Pressable>`:** Use inline `style` or `PressableScale` (NativeWind interop is unregistered via `lib/pressableInterop.ts`).
- **Never import raw `Text` from `'react-native'`:** Always use `import { Text } from '@/lib/rnText'` or `<AppText>` for Inter font mapping.
- **Strict Three-Hue Palette:** Only Signal Purple (`#6C47FF`), Paper White (`#FFFFFF`), and Ink (`#0F0F0F` / `#111111`). No gradients.
- **One Primary CTA Rule:** Only one filled purple button per view.
- **Floating Tab Bar Clearance:** Scrollable containers must include `paddingBottom` for `AnimatedTabBar.tsx` (insets.bottom + 80).
- **Unified Shield Icon Everywhere:** All buyer protection and verification marks across the app (Home cards, related items, product detail, checkout) must use `<ShieldCheckIcon>` matching the canonical product page shield (Signal Purple `#6C47FF`). Never use teal (`#007782`) or ad-hoc shields.
- **Canonical Filter Sliders Icon (Strictly Icon-Only):** All filter controls (Home header, Discover chips, search overlays) must use `<FilterSlidersIcon>` matching the canonical 3-track horizontal sliders (top-left, middle-right, bottom-left) with hollow knob centers, and must be strictly **icon-only** (omit the word "Filter" / "Filters" from the visible button/chip). Never use vertical sliders or generic funnels.
- **Never bypass `GuestGate`:** Maintain auth guards on offer, purchase, sell, and chat actions.
