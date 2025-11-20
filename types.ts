export interface Activity {
  name: string;
  hours: string;
  estimatedCostValue: number; // Numeric value of estimated cost
  estimatedCostCurrency: string; // Currency code, e.g., "JPY", "IDR"
  checkPriceLink: string;
  actualCost: number | null; // User input for actual cost
}

export interface DayItinerary {
  day: number;
  activities: Activity[];
}

export interface GroundingLink {
  uri: string;
  title: string;
}