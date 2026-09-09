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
- **Unified Shield Icon Everywhere:** All buyer protection and verification marks across the app (Home cards, related items, product detail, checkout) must use canonical circular badge `<ShieldCheckIcon>` (viewBox `0 0 24 24`, circular background `#F2F3FE`, stroke `#5356EE` with round checkmark). Never use teal (`#007782`) or ad-hoc shields.
- **Canonical Filter Sliders Icon (Strictly Icon-Only):** All filter controls (Home header, Discover chips, search overlays) must use `<FilterSlidersIcon>` matching the canonical 3-track horizontal sliders (top-left, middle-right, bottom-left) in a canonical 24x24 viewBox with hollow knob centers, and must be strictly **icon-only** (omit the word "Filter" / "Filters" from the visible button/chip). Never use vertical sliders or generic funnels.
- **Strictly No Cross (`×`) on Active Chips:** Never add a trailing or inline cross (`×`) icon to selected chips (Home header dynamic chips or Discover `SearchFilterChips`). Preserve symmetrical pill geometry (`paddingHorizontal: 14`); filter chips retain `chevron-down` in active text contrast.
- **Discover "Saved" Chip Destination:** The "Saved" browse chip (`bookmark` icon) in Discover navigates directly to the Home feed (`/?tab=saved&chipLabel=Saved&chipIcon=bookmark`) to display saved listings directly on the main feed grid, never to `/news`.
- **Never bypass `GuestGate`:** Maintain auth guards on offer, purchase, sell, and chat actions.
