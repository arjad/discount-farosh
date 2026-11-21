/**
 * Neighbourhood ("area") of a branch, worked out from its address — the bank sites don't give one.
 * Rules are checked in order; the first match wins. Add a line here when a new area shows up
 * under "Other" in the filter.
 */
const AREA_RULES: [string, RegExp][] = [
  ["DHA", /\b(dha|defen[cs]e|raya|fairways)\b/i],
  ["Gulberg", /gulberg|gupberg|mm ?alam|liberty|mehmood ali kasoo?ri|kasuri road/i],
  ["Johar Town", /johar town|emporium|pia road/i],
  ["Model Town", /model (town|tn)/i],
  ["Bahria Town", /bahria/i],
  ["Cantt", /\bcantt|cantonment|fortress|cavalry|aziz bhatti|\bcsd\b/i],
  ["Garden Town", /garden town/i],
  ["Faisal Town", /faisal town/i],
  ["Wapda Town", /wapda town/i],
  ["Allama Iqbal Town", /iqbal town/i],
  ["Airport Road", /airport/i],
  ["Township", /township/i],
  ["Valencia", /valencia/i],
  ["Lake City", /lake city/i],
  ["Askari", /askari/i],
  ["Fazaia Housing", /fazaia|falcon ?down ?town/i],
  ["Walton Road", /walton|packages mall|nishtar town/i],
  ["Khayaban-e-Amin", /khayaban|pine ave|edenabad|wocland/i],
  ["Mall Road & GOR", /mall road|the mall|upper mall|shahrah-e-quaid|jail r(oa)?d|jubilee town|race course|\bgor\b|aiwan-e-sanat|avari|garhi shahu/i],
  ["Shadman", /shadman/i],
  ["Canal Road", /canal (bank )?r(oa)?d|lahore canal|gul ?bahar/i],
  ["Ferozepur Road", /feroz(e)?pur/i],
  ["Thokar Niaz Baig", /thok(a|e)r/i],
  ["Barki Road", /barki/i],
  ["Bedian Road", /bedian/i],
  ["Walled City", /walled city|anarkali|fort road|food street/i],
  ["Paragon City", /paragon/i],
  ["Wahdat Road", /wahdat/i],
  ["Samanabad", /samanabad/i],
];

export const OTHER_AREA = "Other";

export function areaOf(address?: string | null): string {
  if (!address) return OTHER_AREA;
  return AREA_RULES.find(([, re]) => re.test(address))?.[0] ?? OTHER_AREA;
}
