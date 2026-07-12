"use client";

import { useRouter } from "next/navigation";
import { CityModal } from "@/app/city/components/CityModal";
import { ProviderProfile } from "./profile";

interface ProviderPopupProps {
  pda: string;
}

export function ProviderPopup({ pda }: ProviderPopupProps) {
  const router = useRouter();
  return (
    <CityModal
      title="Provider"
      icon="🏢"
      subtitle="Agent provider track record"
      onClose={() => router.push("/catalog")}
      maxWidth="3xl"
    >
      <ProviderProfile pda={pda} />
    </CityModal>
  );
}
