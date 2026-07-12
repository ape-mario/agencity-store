"use client";

import { useRouter } from "next/navigation";
import { CityModal } from "@/app/city/components/CityModal";
import { EarningsClient } from "./earnings-client";
import { setPopupClosing } from "@/app/city/lib/popup-state";

export function EarningsPopup() {
  const router = useRouter();

  const handleClose = () => {
    setPopupClosing(true);
    router.push("/");
  };

  return (
    <CityModal
      title="Earnings"
      icon="💰"
      subtitle="Owner referral earnings and settlements"
      onClose={handleClose}
      maxWidth="lg"
    >
      <EarningsClient />
    </CityModal>
  );
}
