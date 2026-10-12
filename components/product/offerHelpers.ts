export const OFFER_PRESET_TIERS = [
  { id: '20', label: '-20%', rate: 0.8 },
  { id: '15', label: '-15%', rate: 0.85 },
  { id: '10', label: '-10%', rate: 0.9 },
  { id: '5', label: '-5%', rate: 0.95 },
  { id: 'custom', label: 'Custom', rate: null },
] as const;

export type OfferTierId = (typeof OFFER_PRESET_TIERS)[number]['id'];

export function calculateTierPrices(askingPrice: number): Record<Exclude<OfferTierId, 'custom'>, number> {
  return {
    '20': Math.max(1, Math.round(askingPrice * 0.8)),
    '15': Math.max(1, Math.round(askingPrice * 0.85)),
    '10': Math.max(1, Math.round(askingPrice * 0.9)),
    '5': Math.max(1, Math.round(askingPrice * 0.95)),
  };
}

export function isValidOfferAmount(amount: number, askingPrice: number): boolean {
  return amount > 0 && (askingPrice <= 0 || amount < askingPrice);
}
