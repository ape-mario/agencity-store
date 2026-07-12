"use client";

import { useRouter } from "next/navigation";
import { CityModal } from "@/app/city/components/CityModal";
import { TrustClient } from "./trust-client";
import { setPopupClosing } from "@/app/city/lib/popup-state";

export function TrustPopup() {
  const router = useRouter();

  const handleClose = () => {
    setPopupClosing(true);
    router.push("/");
  };

  return (
    <CityModal
      title="Trust"
      icon="🛡️"
      subtitle="Buyer protection and referral disclosure"
      onClose={handleClose}
      maxWidth="lg"
    >
      <TrustClient />
    </CityModal>
  );
}
