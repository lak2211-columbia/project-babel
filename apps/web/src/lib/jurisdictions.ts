export const jurisdictionOrder = [
  "united_states",
  "european_union",
  "south_korea",
  "japan",
  "china",
] as const;

export type JurisdictionKey = (typeof jurisdictionOrder)[number];

export const jurisdictionMeta: Record<
  JurisdictionKey,
  {
    slug: string;
    name: string;
    shortName: string;
    flagUrl: string;
  }
> = {
  united_states: {
    slug: "united-states",
    name: "United States",
    shortName: "US",
    flagUrl: "/flags/us.png",
  },
  european_union: {
    slug: "european-union",
    name: "European Union",
    shortName: "EU",
    flagUrl: "/flags/eu.png",
  },
  south_korea: {
    slug: "south-korea",
    name: "South Korea",
    shortName: "KR",
    flagUrl: "/flags/kr.png",
  },
  japan: {
    slug: "japan",
    name: "Japan",
    shortName: "JP",
    flagUrl: "/flags/jp.png",
  },
  china: {
    slug: "china",
    name: "China",
    shortName: "CN",
    flagUrl: "/flags/cn.png",
  },
};
