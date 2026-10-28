import VoteBooth from "@/components/VoteBooth";
import { SCENES } from "@/lib/db";

export default function VotePage() {
  return <VoteBooth scenes={SCENES} />;
}
