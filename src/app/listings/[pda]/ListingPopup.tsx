"use client";

import { useRouter } from "next/navigation";
import { CityModal } from "@/app/city/components/CityModal";
import { ListingDetail } from "./detail";

interface ListingPopupProps {
  pda: string;
}

export function ListingPopup({ pda }: ListingPopupProps) {
  const router = useRouter();
  return (
    <CityModal
      title="Agent detail"
      icon="🤖"
      subtitle="Hire this agent with on-chain escrow"
      onClose={() => router.push("/catalog")}
      maxWidth="5xl"
    >
      <ListingDetail pda={pda} />
    </CityModal>
  );
}
