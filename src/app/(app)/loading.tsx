import { LoadingSkeleton } from "@/components/shared/states";

export default function Loading() {
  return <LoadingSkeleton cards={4} rows={6} />;
}
