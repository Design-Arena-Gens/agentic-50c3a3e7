import { NextRequest } from "next/server";

type Message = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages = (body?.messages ?? []) as Message[];

  const result = await runAgent(messages);
  return Response.json(result);
}

// ---------------- Agent logic ----------------

type AgentResult = {
  done: boolean;
  nextQuestion?: string;
  summary?: GardenSummary;
};

type GardenSummary = {
  styles: string[];
  moodWords: string[];
  plantPalette: string[];
  features: string[];
  usagePlan: string[];
  sunlight: string | null;
  maintenance: string | null;
  climate: string | null;
  notes: string[];
};

const QUESTION_ORDER: QuestionKey[] = [
  "feels",
  "style",
  "plants",
  "use",
  "maintenance",
  "sun",
  "climate",
  "constraints",
];

type QuestionKey =
  | "feels"
  | "style"
  | "plants"
  | "use"
  | "maintenance"
  | "sun"
  | "climate"
  | "constraints";

type Question = { key: QuestionKey; text: string };

const QUESTIONS: Record<QuestionKey, Question> = {
  feels: { key: "feels", text: "Q-feels: What feelings should your garden evoke? (e.g., calm, cozy, vibrant, playful, refined)" },
  style: { key: "style", text: "Q-style: What garden styles do you gravitate to? (modern, cottage, Mediterranean, Japanese/Zen, desert/xeriscape, tropical, native/wildlife)" },
  plants: { key: "plants", text: "Q-plants: Any plants you love or dislike? (e.g., lavender, grasses, succulents, ferns, roses, palms)" },
  use: { key: "use", text: "Q-use: How will you use the space? (entertaining, dining, kids, pets, quiet reading, growing food)" },
  maintenance: { key: "maintenance", text: "Q-maintenance: How much upkeep is realistic? (low, medium, high)" },
  sun: { key: "sun", text: "Q-sun: What sunlight do you get? (full sun, partial shade, mostly shade)" },
  climate: { key: "climate", text: "Q-climate: Where are you located or what climate/USDA zone? (coastal, desert, tropical, temperate, cold)" },
  constraints: { key: "constraints", text: "Q-constraints: Any constraints? (small space, slope, HOA, water restrictions, budget)" },
};

async function runAgent(messages: Message[]): Promise<AgentResult> {
  // Optional: LLM path (disabled by default). Keep simple rule-based agent to work without keys.
  // If you want to enable LLM behavior, set OPENAI_API_KEY; otherwise, rule-based logic runs.
  // const hasLLM = !!process.env.OPENAI_API_KEY;

  const asked = getAskedKeys(messages);
  const analysis = analyze(messages);

  // Decide if we're done: after 6+ unique keys asked, or user hints "that's all".
  const userText = messages.filter((m) => m.role === "user").map((m) => m.content.toLowerCase()).join("\n");
  const doneBySignal = /that's all|that is all|enough|done|finish/.test(userText);
  const doneByCoverage = asked.size >= 6;

  if (doneBySignal || doneByCoverage) {
    const summary = synthesizeSummary(analysis);
    return {
      done: true,
      summary,
      nextQuestion: undefined,
    };
  }

  // Choose next question with light adaptation
  const nextKey = chooseNextKey(asked, analysis);
  const question = QUESTIONS[nextKey].text;
  return {
    done: false,
    nextQuestion: question,
  };
}

function getAskedKeys(messages: Message[]): Set<QuestionKey> {
  const asked = new Set<QuestionKey>();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const match = m.content.match(/^Q-(\w+):/);
    if (match) {
      const key = match[1] as QuestionKey;
      if (key in QUESTIONS) asked.add(key);
    }
  }
  return asked;
}

function chooseNextKey(asked: Set<QuestionKey>, a: Analysis): QuestionKey {
  const needSun = !a.sunlight;
  const needMaint = !a.maintenance;
  const needClimate = !a.climate;
  const needPlants = a.likedPlants.length === 0 && a.dislikedPlants.length === 0;

  // Adaptive nudges
  if (needPlants && !asked.has("plants")) return "plants";
  if (a.hasKidsOrPets && !asked.has("use")) return "use";
  if (needSun && !asked.has("sun")) return "sun";
  if (needMaint && !asked.has("maintenance")) return "maintenance";
  if (needClimate && !asked.has("climate")) return "climate";

  for (const key of QUESTION_ORDER) {
    if (!asked.has(key)) return key;
  }
  return "constraints";
}

// ---------------- Analysis ----------------

type Analysis = {
  styles: Record<string, number>;
  mood: Set<string>;
  likedPlants: string[];
  dislikedPlants: string[];
  usage: Set<string>;
  maintenance: string | null;
  sunlight: string | null;
  climate: string | null;
  constraints: Set<string>;
  hasKidsOrPets: boolean;
};

const STYLE_KEYWORDS: Record<string, string[]> = {
  "Modern Minimal": ["modern", "minimal", "clean", "structured", "architectural", "contemporary"],
  "Cottage Romantic": ["cottage", "romantic", "whimsical", "english", "abundant", "flowers"],
  "Mediterranean Dry": ["mediterranean", "olive", "terracotta", "dry", "drought", "sun-baked"],
  "Japanese Zen": ["japanese", "zen", "calm", "raked", "maple", "stone", "moss"],
  "Desert Xeriscape": ["desert", "xeriscape", "succulent", "cactus", "agave"],
  "Tropical Lush": ["tropical", "lush", "palms", "banana", "exotic"],
  "Native Wildlife": ["native", "wildlife", "pollinator", "meadow", "prairie"]
};

const MOOD_WORDS = [
  "calm", "cozy", "vibrant", "playful", "refined", "relaxed", "elegant", "wild", "formal", "romantic", "rustic", "serene", "lush", "minimal"
];

const USAGE_WORDS = ["entertaining", "dining", "kids", "children", "pets", "dog", "cat", "reading", "quiet", "food", "vegetable", "veggie", "bbq", "grill", "firepit", "hot tub", "pool"];

const CONSTRAINT_WORDS = ["small", "tiny", "narrow", "slope", "steep", "hoa", "water restriction", "budget", "wind", "deer", "rabbit", "privacy"];

const SUN_MAP: Record<string, string> = {
  "full sun": "full sun",
  "lots of sun": "full sun",
  "sunny": "full sun",
  "partial shade": "partial shade",
  "part shade": "partial shade",
  "dappled": "partial shade",
  "mostly shade": "shade",
  "shade": "shade",
};

const CLIMATE_WORDS: Record<string, string[]> = {
  "coastal": ["coastal", "salt", "ocean"],
  "desert": ["desert", "arid", "drought"],
  "tropical": ["tropical", "humid", "rainforest"],
  "temperate": ["temperate", "mild"],
  "cold": ["cold", "alpine", "snow"]
};

const PLANT_SYNONYMS: Record<string, string[]> = {
  lavender: ["lavender"],
  grasses: ["grass", "grasses", "panicum", "miscanthus"],
  succulents: ["succulent", "succulents", "agave", "aloe", "sedum"],
  ferns: ["fern", "ferns"],
  roses: ["rose", "roses"],
  palms: ["palm", "palms"],
  maples: ["maple", "acer"],
  conifers: ["pine", "cedar", "spruce", "juniper"],
  wildflowers: ["wildflower", "echinacea", "rudbeckia", "salvia"],
};

function analyze(messages: Message[]): Analysis {
  const text = messages.filter(m => m.role === "user").map(m => m.content.toLowerCase()).join("\n");

  const styles: Record<string, number> = Object.fromEntries(Object.keys(STYLE_KEYWORDS).map(k => [k, 0]));
  for (const [style, words] of Object.entries(STYLE_KEYWORDS)) {
    for (const w of words) {
      const count = occurrences(text, w);
      styles[style] += count;
    }
  }

  const mood = new Set<string>();
  for (const w of MOOD_WORDS) if (text.includes(w)) mood.add(cap(w));

  const usage = new Set<string>();
  for (const w of USAGE_WORDS) if (text.includes(w)) usage.add(cap(w));

  const constraints = new Set<string>();
  for (const w of CONSTRAINT_WORDS) if (text.includes(w)) constraints.add(cap(w));

  let maintenance: string | null = null;
  if (/(low|minimal|no) maintenance|low upkeep/.test(text)) maintenance = "low";
  else if (/medium maintenance|some upkeep/.test(text)) maintenance = "medium";
  else if (/(high|intensive) maintenance|love gardening/.test(text)) maintenance = "high";

  let sunlight: string | null = null;
  for (const [k, v] of Object.entries(SUN_MAP)) if (text.includes(k)) sunlight = v;

  let climate: string | null = null;
  for (const [k, arr] of Object.entries(CLIMATE_WORDS)) if (arr.some((w) => text.includes(w))) climate = k;

  const likedPlants: string[] = [];
  const dislikedPlants: string[] = [];
  for (const [plant, syns] of Object.entries(PLANT_SYNONYMS)) {
    if (syns.some((w) => text.includes(`love ${w}`) || text.includes(`like ${w}`) || text.includes(w))) {
      likedPlants.push(cap(plant));
    }
    if (syns.some((w) => text.includes(`dislike ${w}`) || text.includes(`hate ${w}`) || text.includes(`avoid ${w}`))) {
      dislikedPlants.push(cap(plant));
    }
  }

  const hasKidsOrPets = /(kid|child|children|pet|dog|cat)/.test(text);

  return { styles, mood, likedPlants, dislikedPlants, usage, maintenance, sunlight, climate, constraints, hasKidsOrPets };
}

function occurrences(text: string, needle: string): number {
  const re = new RegExp(needle.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
  return (text.match(re) || []).length;
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function synthesizeSummary(a: Analysis): GardenSummary {
  const stylesRanked = Object.entries(a.styles).sort((a,b) => b[1] - a[1]);
  const top = stylesRanked.filter(([,score]) => score > 0).slice(0, 2).map(([name]) => name);
  const fallback = top.length > 0 ? top : ["Contemporary Natural"];

  const palette = buildPalette(fallback, a);
  const features = buildFeatures(fallback, a);
  const usagePlan = buildUsage(a);
  const mood = Array.from(a.mood);

  const notes: string[] = [];
  if (a.dislikedPlants.length) notes.push(`Avoid: ${a.dislikedPlants.join(", ")}`);
  if (a.constraints.size) notes.push(`Constraints: ${Array.from(a.constraints).join(", ")}`);

  return {
    styles: fallback,
    moodWords: mood.length ? mood : ["Calm", "Welcoming"],
    plantPalette: palette,
    features,
    usagePlan,
    sunlight: a.sunlight,
    maintenance: a.maintenance,
    climate: a.climate,
    notes,
  };
}

function buildPalette(styles: string[], a: Analysis): string[] {
  const items = new Set<string>();
  for (const style of styles) {
    switch (style) {
      case "Modern Minimal":
        add(items, "Evergreen structure: Buxus balls, Podocarpus, clipped yew");
        add(items, "Grasses: Miscanthus, Pennisetum for movement");
        add(items, "Monochrome perennials: White Agapanthus, Salvia, Gaura");
        break;
      case "Cottage Romantic":
        add(items, "Perennials: Lavender, Nepeta, Salvia, Echinacea, Foxglove");
        add(items, "Roses and climbers: David Austin roses, Clematis");
        add(items, "Soft grasses: Deschampsia, Stipa tenuissima");
        break;
      case "Mediterranean Dry":
        add(items, "Drought-tolerant: Olive, Rosemary, Lavender, Santolina");
        add(items, "Silvery foliage: Helichrysum, Artemisia");
        add(items, "Herbs and citrus in terracotta");
        break;
      case "Japanese Zen":
        add(items, "Structure: Japanese maple, Bamboo (clumping), Pine cloud-pruned");
        add(items, "Ground: Moss, Ophiopogon, Ferns");
        add(items, "Accents: Irises, Azaleas");
        break;
      case "Desert Xeriscape":
        add(items, "Succulents: Agave, Aloe, Echeveria, Opuntia");
        add(items, "Cacti & yucca; gravel mulch");
        add(items, "Heat-lovers: Red hot poker, Verbena bonariensis");
        break;
      case "Tropical Lush":
        add(items, "Foliage drama: Bananas, Colocasia, Alocasia, Philodendron (hardy types)");
        add(items, "Palms: Trachycarpus, Chamaerops");
        add(items, "Bold color: Canna, Hibiscus");
        break;
      case "Native Wildlife":
        add(items, "Natives: Echinacea, Rudbeckia, Solidago, Asclepias");
        add(items, "Grasses: Little bluestem, Switchgrass");
        add(items, "Shrubs: Serviceberry, Viburnum");
        break;
    }
  }

  // Sunlight and climate adjustments
  if (a.sunlight === "shade") {
    add(items, "Shade lovers: Hosta, Ferns, Heuchera, Astilbe, Hellebore");
  } else if (a.sunlight === "partial shade") {
    add(items, "Part-shade adaptable: Hydrangea, Heucherella, Brunnera, Tiarella");
  } else if (a.sunlight === "full sun") {
    add(items, "Sun lovers: Salvia, Nepeta, Gaura, Coreopsis, Achillea");
  }

  if (a.maintenance === "low") add(items, "Low-maintenance backbone: evergreen shrubs, groundcovers, mulch");
  if (a.climate === "coastal") add(items, "Coastal tolerant: Armeria, Sea kale, Escallonia");
  if (a.climate === "cold") add(items, "Cold-hardy focus: conifers, grasses, perennials to zone");
  if (a.climate === "desert") add(items, "Ultra drought: Agastache, Salvia greggii, Teucrium");

  // Respect likes/dislikes
  for (const like of a.likedPlants) add(items, like);
  for (const dislike of a.dislikedPlants) items.delete(dislike);

  return Array.from(items);
}

function buildFeatures(styles: string[], a: Analysis): string[] {
  const items = new Set<string>();
  if (styles.includes("Modern Minimal")) add(items, "Clean pavers with steel edging and lighting");
  if (styles.includes("Cottage Romantic")) add(items, "Meandering path, arch with climbers, rustic seating");
  if (styles.includes("Mediterranean Dry")) add(items, "Gravel terrace, terracotta pots, simple pergola");
  if (styles.includes("Japanese Zen")) add(items, "Stone basin, gravel raked area, timber deck");
  if (styles.includes("Desert Xeriscape")) add(items, "Rock garden mounds, boulders, decomposed granite");
  if (styles.includes("Tropical Lush")) add(items, "Shaded seating, water feature, layered canopy");
  if (styles.includes("Native Wildlife")) add(items, "Pollinator bed, bird bath, meadow edge");

  if (a.maintenance === "low") add(items, "Drip irrigation and weed-suppressing mulch");
  if (a.sunlight === "full sun") add(items, "Shade sail or pergola for hot afternoons");

  if (a.hasKidsOrPets) add(items, "Durable lawn alternative and pet-safe, kid-friendly plants");
  if (Array.from(a.usage).some((u) => /entertain|dining|bbq|grill|firepit|hot tub|pool|reading|quiet|food|vegetable/.test(u.toLowerCase()))) {
    for (const u of a.usage) {
      if (/entertain|dining|bbq|grill/.test(u.toLowerCase())) add(items, "Dining terrace near kitchen and grill zone");
      if (/firepit/.test(u.toLowerCase())) add(items, "Fire pit with circular seating");
      if (/hot tub|pool/.test(u.toLowerCase())) add(items, "Privacy planting around water features");
      if (/reading|quiet/.test(u.toLowerCase())) add(items, "Quiet nook with bench and screening");
      if (/food|vegetable|veggie/.test(u.toLowerCase())) add(items, "Compact raised beds for edibles");
    }
  }

  return Array.from(items);
}

function buildUsage(a: Analysis): string[] {
  const out = new Set<string>();
  for (const u of a.usage) out.add(u);
  if (a.hasKidsOrPets) out.add("Safe play and pet circulation considered");
  if (!out.size) out.add("Relaxation and light entertaining");
  return Array.from(out);
}

function add(set: Set<string>, value: string) { set.add(value); }
