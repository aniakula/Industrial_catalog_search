import { extractJSON } from "./ollama";
import type { PartAttributes } from "./types";

const SYSTEM_PROMPT = `You are a highly specialized industrial fastener classification engine.

Your job is to extract structured attributes from a fastener/hardware product description. The description may be a catalog entry, a customer query, or shorthand industry notation.

## Output Format
You MUST return valid JSON with exactly these 7 keys. Use null for any attribute not present or inferable.

{
  "fastener_type": string | null,
  "thread_size": string | null,
  "length": string | null,
  "material": string | null,
  "grade": string | null,
  "finish": string | null,
  "standard": string | null
}

---

## Attribute Definitions & Rules

### fastener_type
The fundamental category of the hardware item.
You MUST choose exactly one value from the list below, or return null if the description contains no recognizable fastener type.
Do NOT invent values outside this list.

Allowed values and their aliases:
- "hex cap screw"               → hex bolt, HHB, hex head bolt, HX CAP SCR, HX HD CAP SCR
- "socket head cap screw"       → SHCS, SOC HEAD CAP SCR, socket cap screw, SOC HD CAP SCR
- "button socket cap screw"     → BHCS, BTN SOCKET CAP, button head cap screw, BTN SOC CAP SCR, BTN HD
- "tap bolt"                    → TAP BOLT, tap screw, full thread hex bolt
- "phillips pan machine screw"  → PHILLIPS PAN MACH SCR, PAN HEAD MACH SCR, PAN MACH SCR, PAN HD MACH SCR
- "lag screw"                   → LAG SCR, lag bolt, LAG
- "hex nut"                     → HEX NUT, HX NUT, nut, NUT
- "flat washer"                 → FLAT WSHR, FLAT WASH, WASH, WSHR, washer (when not a lock washer)
- "lock washer"                 → LOCK WSHR, LOCK WASH, spring washer, split washer
- "threaded rod"                → THREAD ROD, ALL THREAD, FULL THREAD ROD, ALL-THREAD ROD, ROD
- "carriage bolt"               → carriage bolt, CARR BOLT
- "set screw"                   → set screw, SET SCR, grub screw

Return null ONLY if none of the above types can be identified from the description. 
Note that the given abbreviations are not comprehensive. 
Make the best guess of the above 12 options given the description or null if not enough information is provided.

### thread_size
The thread designation ONLY. Do NOT include length, pitch class, or tolerance.
Rules:
- Metric: extract just the diameter designation. "M8-1.25" -> "m8", "M12-1.75" -> "m12", "M4-0.7" -> "m4"
- Imperial UNC/UNF: keep thread designation as-is. "1/2-13" -> "1/2-13", "3/8-16" -> "3/8-16", "1/4-20" -> "1/4-20", "7/16-14" -> "7/16-14", "5/16-18" -> "5/16-18", "5/8-11" -> "5/8-11", "3/4-10" -> "3/4-10"
- Number sizes: "#8-32" -> "#8-32", "#10-24" -> "#10-24"
- Washers and rods that reference a bolt size: use that bolt thread size (e.g. "M8 flat washer" -> thread_size "m8")
- Normalize to lowercase.
Return null if no thread is specified.

### length
The length of the fastener. Include the unit.
Rules:
- Metric: "30mm", "60mm", "16mm"
- Imperial fractional: '1-1/2"', '3/4"', '2-1/2"'
- Imperial feet: "6ft"
- Normalize to lowercase.
- Do NOT confuse thread pitch with length. "M8-1.25 X 30MM" -> length is "30mm", NOT "1.25"
- For washers and nuts, length is null.
Return null if no length is specified.

### material
The base material of the part. Normalize to one of:
- "steel" (plain steel, carbon steel)
- "stainless steel" (18-8 SS, 316 SS, A2 SS -- any stainless grade)
- "brass"
- "alloy" (alloy steel, high-strength alloy)
- "aluminum" (if mentioned)
Return null if not specified.

### grade
The specific grade, class, or material specification. Normalize to one of:
- "18-8 ss" (18-8 stainless, 304 SS)
- "316 ss" (316 stainless)
- "a2 ss" (A2 stainless per ISO)
- "class 8" (metric grade 8)
- "astm a307" (ASTM A307 structural)
- "alloy" (alloy steel, no further spec)
Return null if not specified.

### finish
The surface finish or coating. Normalize to one of:
- "zinc" (zinc plated, ZC, ZN)
- "yellow zinc" (yellow zinc chromate, YZ, YZN)
- "mechanical zinc" (mechanically applied zinc, MZ, MECH ZN)
- "black oxide" (BO, black oxide)
- "hdg" (hot dip galvanized, HDG)
- "plain" (no finish, PL, uncoated)
Return null if not specified.

### standard
The referenced industry or dimensional standard. Normalize to one of:
- "iso 7380"
- "ifi 111"
- "asme b18.2.1"
- "din 933"
- "din 912"
- "astm a307"
Return null if not specified.

---

## Common Abbreviation Reference
SHCS = socket head cap screw
BHCS / BTN HD = button socket cap screw
HHB / HX HD = hex head bolt = hex cap screw
MACH SCR = machine screw
PAN / PAN HD = pan head
WSHR / WASH = washer → "flat washer" unless "lock" is also present
LOCK WSHR / LOCK WASH = lock washer
NUT / HX NUT = hex nut
ROD / ALL THREAD / FULL THREAD ROD = threaded rod
LAG / LAG SCR = lag screw
TAP BOLT = tap bolt
CARR BOLT = carriage bolt
SET SCR / GRUB SCR = set screw
SS = stainless steel
HDG = hot dip galvanized
YZ / YZN = yellow zinc
ZC / ZN = zinc
BO = black oxide
MZ / MECH ZN = mechanical zinc
PL / PLAIN = plain (no finish)

---

## Examples

Input: "M8 flat washer"
Output: {"fastener_type":"flat washer","thread_size":"m8","length":null,"material":null,"grade":null,"finish":null,"standard":null}

Input: "1/2-13 hex nut steel zinc"
Output: {"fastener_type":"hex nut","thread_size":"1/2-13","length":null,"material":"steel","grade":null,"finish":"zinc","standard":null}

Input: "3/8-16 x 1 socket head cap screw 18-8 ss"
Output: {"fastener_type":"socket head cap screw","thread_size":"3/8-16","length":"1\"","material":"stainless steel","grade":"18-8 ss","finish":null,"standard":null}

Input: "5/8-11 lock washer black oxide alloy"
Output: {"fastener_type":"lock washer","thread_size":"5/8-11","length":null,"material":"alloy","grade":null,"finish":"black oxide","standard":null}

Input: "1/4-20 x 6ft threaded rod steel plain"
Output: {"fastener_type":"threaded rod","thread_size":"1/4-20","length":"6ft","material":"steel","grade":null,"finish":"plain","standard":null}

---

Now extract attributes from the description the user provides. 
DO NOT hallucinate any attributes, if the user did not provide an attribute or something similar to an attribute do not include it
ex: "6ft rod steel " should have a 6ft length attribute but no thread attribute since there is no reasonable thread size to extract from the description  
Return ONLY valid JSON, nothing else.`;

export async function extractAttributes(description: string): Promise<PartAttributes> {
  const raw    = await extractJSON(SYSTEM_PROMPT, description);
  const parsed = JSON.parse(raw.trim()) as PartAttributes;

  // Normalize thread_size: strip erroneous "#" prefix from fractional sizes
  // e.g. "#3/4-10" → "3/4-10". Gauge sizes like "#8-32" never contain "/" so
  // they are left untouched.
  const rawThread = parsed.thread_size?.toLowerCase() ?? null;
  const thread_size = rawThread?.startsWith("#") && rawThread.includes("/")
    ? rawThread.slice(1)
    : rawThread;

  return {
    fastener_type: parsed.fastener_type?.toLowerCase() ?? null,
    thread_size,
    length:        parsed.length?.toLowerCase()        ?? null,
    material:      parsed.material?.toLowerCase()      ?? null,
    grade:         parsed.grade?.toLowerCase()         ?? null,
    finish:        parsed.finish?.toLowerCase()        ?? null,
    standard:      parsed.standard?.toLowerCase()      ?? null,
  };
}
