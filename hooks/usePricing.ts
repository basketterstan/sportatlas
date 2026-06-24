export type PlanPriceMap = {
  basic: { monthly: string; yearly: string };
  pro: { monthly: string; yearly: string };
  club10: { monthly: string; yearly: string };
  club20: { monthly: string; yearly: string };
  clubUnlimited: { monthly: string; yearly: string };
};

const EUR_FALLBACK: PlanPriceMap = {
  basic:         { monthly: '€9.99',  yearly: '€99.99'  },
  pro:           { monthly: '€14.99', yearly: '€149.00' },
  club10:        { monthly: '€99',    yearly: '€999'    },
  club20:        { monthly: '€169',   yearly: '€1,699'  },
  clubUnlimited: { monthly: '€249',   yearly: '€2,499'  },
};

export function usePricing(): PlanPriceMap {
  return EUR_FALLBACK;
}
