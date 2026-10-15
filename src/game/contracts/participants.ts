import { LIMITS, ParticipantSchema, ParticipantsSchema, type Participant } from "./schemas";
export const PARTICIPANT_COLORS = [
  "#FF687B",
  "#FFD45E",
  "#8FF07A",
  "#66E8F1",
  "#A78BFA",
  "#F67CDE",
] as const;
export type ParticipantInputResult =
  | { ok: true; participants: Participant[] }
  | { ok: false; message: string };
export function expandParticipantNames(text: string):
  | { ok: true; names: string[] }
  | { ok: false; message: string } {
  if (text.length > 300000)
    return { ok: false, message: "입력이 너무 깁니다. 총 2~10,000개, 이름당 24글자까지 입력해 주세요." };
  const entries = text.split(/[,\r\n]/).map((entry) => entry.trim()).filter(Boolean);
  const names: string[] = [];
  for (const [index, entry] of entries.entries()) {
    const parts = entry.split("*");
    const quantity = parts.length === 1 ? 1 : Number(parts[1]?.trim());
    if (parts.length > 2 || (parts.length === 2 && !/^\d+$/.test(parts[1]!.trim())) ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > LIMITS.participants)
      return { ok: false, message: `${index + 1}번째 항목: 이름*9처럼 1~10,000의 정수 배수를 입력해 주세요.` };
    const name = ParticipantSchema.shape.name.safeParse(parts[0]!.trim());
    if (!name.success)
      return { ok: false, message: `${index + 1}번째 항목: 이름은 1~24글자이며 제어 문자·HTML·URL·코드를 사용할 수 없습니다.` };
    // Check before expansion so huge multipliers cannot allocate huge arrays.
    if (names.length + quantity > LIMITS.participants)
      return { ok: false, message: "배수를 합친 구슬 수는 최대 10,000개입니다." };
    for (let i = 0; i < quantity; i++) names.push(name.data);
  }
  if (names.length < 2)
    return { ok: false, message: "구슬을 2개 이상 입력해 주세요. 이름*9처럼 같은 이름을 여러 개 넣을 수 있어요." };
  return { ok: true, names };
}
export function parseParticipantNames(text: string, previous: readonly Participant[] = []): ParticipantInputResult {
  const expanded = expandParticipantNames(text);
  if (!expanded.ok) return expanded;
  const participants = ParticipantsSchema.parse(expanded.names.map((name, index) => ({
    id: previous[index]?.id ?? crypto.randomUUID(),
    name,
    appearance: { kind: "solid", color: PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length]! },
  })));
  return { ok: true, participants };
}
export function numberedNames(start: number, count: number): string {
  if (
    !Number.isSafeInteger(start) ||
    start < -999999 ||
    start > 999999 ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > LIMITS.participants
  )
    throw new Error(
      "시작 번호는 -999999~999999, 구슬 수는 2~10,000의 정수로 입력해 주세요.",
    );
  return Array.from({ length: count }, (_, index) =>
    String(start + index),
  ).join("\n");
}
export function numberedParticipants(count: number): Participant[] {
  const result = parseParticipantNames(numberedNames(1, count));
  if (!result.ok) throw new Error(result.message);
  return result.participants;
}
