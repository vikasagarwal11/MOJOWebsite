/**
 * Stripe Pricing Utilities
 * 
 * Golden Rule: Stripe fees (2.9% + $0.30) are calculated ONCE at the transaction level,
 * NEVER at the item level.
 * 
 * Admin enters NET amounts (what they receive after fees).
 * Users pay CHARGE amounts (what includes Stripe fees).
 * 
 * Formula: chargeAmount = (netTotal + 0.30) / 0.971
 * 
 * This ensures:
 * - Admin receives exactly the net amount they specified
 * - User pays exactly what Stripe charges
 * - No hidden fees or discrepancies
 */

/**
 * Stripe fee configuration
 */
export const STRIPE_FEE_PERCENTAGE = 0.029; // 2.9%
export const STRIPE_FEE_FIXED_CENTS = 30; // $0.30
export const STRIPE_FEE_MULTIPLIER = 1 - STRIPE_FEE_PERCENTAGE; // 0.971

/**
 * Calculate the total charge amount that includes Stripe fees
 * 
 * @param netTotalCents - The net amount the admin wants to receive (in cents)
 * @returns The amount to charge the user (in cents)
 * 
 * @example
 * calculateChargeAmount(3000) // Net: $30.00 → Charge: $31.20
 */
export function calculateChargeAmount(netTotalCents: number): number {
  if (netTotalCents <= 0) return 0;
  
  // Formula: chargeAmount = (netTotal + 0.30) / 0.971
  const chargeAmount = (netTotalCents + STRIPE_FEE_FIXED_CENTS) / STRIPE_FEE_MULTIPLIER;
  
  // Round to nearest cent
  return Math.round(chargeAmount);
}

/**
 * Calculate the net amount the admin will receive after Stripe fees
 * 
 * @param chargeTotalCents - The amount charged to the user (in cents)
 * @returns The net amount the admin receives (in cents)
 * 
 * @example
 * calculateNetAmount(3120) // Charge: $31.20 → Net: $30.00
 */
export function calculateNetAmount(chargeTotalCents: number): number {
  if (chargeTotalCents <= 0) return 0;
  
  // Reverse formula: netAmount = (chargeAmount * 0.971) - 0.30
  const netAmount = (chargeTotalCents * STRIPE_FEE_MULTIPLIER) - STRIPE_FEE_FIXED_CENTS;
  
  // Round to nearest cent
  return Math.round(netAmount);
}

/**
 * Calculate Stripe fee for a given charge amount
 * 
 * @param chargeTotalCents - The amount charged to the user (in cents)
 * @returns The Stripe fee (in cents)
 */
export function calculateStripeFee(chargeTotalCents: number): number {
  if (chargeTotalCents <= 0) return 0;
  
  const stripeFee = chargeTotalCents - calculateNetAmount(chargeTotalCents);
  return Math.round(stripeFee);
}

/**
 * Price component for proportional distribution
 */
export interface PriceComponent {
  id: string; // Unique identifier (e.g., attendeeId, "event", "addon-1")
  label: string; // Display label (e.g., "Adult Ticket", "Event Support", "Add-on")
  netAmount: number; // Net amount in cents (admin receives)
}

/**
 * Charged price component after Stripe fee distribution
 */
export interface ChargedPriceComponent extends PriceComponent {
  chargeAmount: number; // Charge amount in cents (user pays)
}

/**
 * Distribute Stripe fees proportionally across all price components
 * 
 * This is the CORE function that implements the non-negotiable rule:
 * 1. Calculate total charge amount once for all components
 * 2. Distribute proportionally based on net amounts
 * 3. Handle rounding by adjusting the largest component
 * 
 * @param components - Array of price components with net amounts
 * @returns Array of components with charge amounts calculated
 * 
 * @example
 * const components = [
 *   { id: '1', label: 'Event Ticket', netAmount: 2500 },
 *   { id: '2', label: 'Add-on', netAmount: 500 }
 * ];
 * const result = distributeStripeFees(components);
 * // result[0].chargeAmount ≈ 2600 (proportional share of $31.20)
 * // result[1].chargeAmount ≈ 520 (proportional share of $31.20)
 * // sum of chargeAmounts = 3120 (exactly matches total charge)
 */
export function distributeStripeFees(
  components: PriceComponent[]
): ChargedPriceComponent[] {
  if (components.length === 0) return [];
  
  // Calculate total net amount
  const netTotal = components.reduce((sum, c) => sum + c.netAmount, 0);
  
  if (netTotal <= 0) {
    return components.map(c => ({ ...c, chargeAmount: 0 }));
  }
  
  // Calculate total charge amount (Stripe fees applied ONCE)
  const chargeTotal = calculateChargeAmount(netTotal);
  
  // Distribute charge amount proportionally
  const result: ChargedPriceComponent[] = components.map(component => {
    // Calculate proportional share
    const proportion = component.netAmount / netTotal;
    const chargeAmount = Math.round(chargeTotal * proportion);
    
    return {
      ...component,
      chargeAmount
    };
  });
  
  // Handle rounding remainder by adjusting the largest component
  const calculatedTotal = result.reduce((sum, c) => sum + c.chargeAmount, 0);
  const remainder = chargeTotal - calculatedTotal;
  
  if (remainder !== 0) {
    // Find the component with the largest net amount
    const largestIndex = result.reduce((maxIdx, current, idx, arr) => 
      current.netAmount > arr[maxIdx].netAmount ? idx : maxIdx
    , 0);
    
    result[largestIndex].chargeAmount += remainder;
  }
  
  return result;
}

/**
 * Calculate pricing breakdown for display in admin UI
 * 
 * @param netTotalCents - The net amount the admin wants to receive (in cents)
 * @returns Breakdown showing net, charge, and fee amounts
 */
export interface PricingBreakdown {
  netAmount: number; // What admin receives (in cents)
  chargeAmount: number; // What user pays (in cents)
  stripeFee: number; // Stripe fee (in cents)
  netAmountDisplay: string; // Formatted for display: "$30.00"
  chargeAmountDisplay: string; // Formatted for display: "$31.20"
  stripeFeeDisplay: string; // Formatted for display: "$1.20"
}

export function calculatePricingBreakdown(netTotalCents: number): PricingBreakdown {
  const chargeAmount = calculateChargeAmount(netTotalCents);
  const stripeFee = calculateStripeFee(chargeAmount);
  
  return {
    netAmount: netTotalCents,
    chargeAmount,
    stripeFee,
    netAmountDisplay: formatCentsToDisplay(netTotalCents),
    chargeAmountDisplay: formatCentsToDisplay(chargeAmount),
    stripeFeeDisplay: formatCentsToDisplay(stripeFee)
  };
}

/**
 * Format cents to display string
 */
export function formatCentsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Helper function to convert dollars to cents safely
 */
export function dollarsToCents(dollars: string | number): number {
  const dollarValue = typeof dollars === 'string' ? dollars : dollars.toString();
  if (!dollarValue || dollarValue.trim() === '') return 0;
  
  const numValue = parseFloat(dollarValue);
  if (isNaN(numValue) || numValue < 0) return 0;
  
  // Convert to string with exactly 2 decimal places, then remove the decimal point
  const fixedStr = numValue.toFixed(2);
  const centsStr = fixedStr.replace('.', '');
  return parseInt(centsStr, 10);
}

/**
 * Helper function to convert cents to dollars
 */
export function centsToDollars(cents: number): string {
  if (!cents || cents === 0) return '';
  const dollars = Math.round(cents) / 100;
  return dollars.toFixed(2);
}

/**
 * Calculate proportional pricing breakdown for ticket + event support
 * Shows what user will pay for each component when Stripe fee is distributed proportionally
 * 
 * @param ticketNetCents - NET amount for the ticket (what admin receives)
 * @param supportNetCents - NET amount for event support (what admin receives)
 * @returns Breakdown showing ticket charge, support charge, and combined total
 */
export interface ProportionalPricingBreakdown {
  ticketNet: number; // Ticket NET amount (cents)
  ticketCharge: number; // Ticket CHARGE amount with proportional fee (cents)
  supportNet: number; // Support NET amount (cents)
  supportCharge: number; // Support CHARGE amount with proportional fee (cents)
  totalNet: number; // Combined NET (cents)
  totalCharge: number; // Combined CHARGE (cents)
  totalStripeFee: number; // Total Stripe fee (cents)
  ticketChargeDisplay: string; // "$26.00"
  supportChargeDisplay: string; // "$5.20"
  totalChargeDisplay: string; // "$31.20"
  totalStripeFeeDisplay: string; // "$1.20"
}

export function calculateProportionalPricing(
  ticketNetCents: number,
  supportNetCents: number = 0
): ProportionalPricingBreakdown {
  const components = [];
  
  if (ticketNetCents > 0) {
    components.push({
      id: 'ticket',
      label: 'Ticket',
      netAmount: ticketNetCents
    });
  }
  
  if (supportNetCents > 0) {
    components.push({
      id: 'support',
      label: 'Event Support',
      netAmount: supportNetCents
    });
  }
  
  const charged = distributeStripeFees(components);
  const ticketCharged = charged.find(c => c.id === 'ticket');
  const supportCharged = charged.find(c => c.id === 'support');
  
  const ticketCharge = ticketCharged?.chargeAmount || 0;
  const supportCharge = supportCharged?.chargeAmount || 0;
  const totalNet = ticketNetCents + supportNetCents;
  const totalCharge = ticketCharge + supportCharge;
  const totalStripeFee = totalCharge - totalNet;
  
  return {
    ticketNet: ticketNetCents,
    ticketCharge,
    supportNet: supportNetCents,
    supportCharge,
    totalNet,
    totalCharge,
    totalStripeFee,
    ticketChargeDisplay: formatCentsToDisplay(ticketCharge),
    supportChargeDisplay: formatCentsToDisplay(supportCharge),
    totalChargeDisplay: formatCentsToDisplay(totalCharge),
    totalStripeFeeDisplay: formatCentsToDisplay(totalStripeFee)
  };
}
