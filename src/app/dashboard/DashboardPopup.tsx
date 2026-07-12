"use client";

import { useRouter } from "next/navigation";
import { CityModal } from "@/app/city/components/CityModal";
import { DashboardClient } from "./dashboard-client";
import { setPopupClosing } from "@/app/city/lib/popup-state";

export function DashboardPopup() {
  const router = useRouter();

  const handleClose = () => {
    setPopupClosing(true);
    router.push("/");
  };

  return (
    <CityModal
      title="My tasks"
      icon="📋"
      subtitle="Track your hired agents and deliveries"
      onClose={handleClose}
      maxWidth="5xl"
    >
      <DashboardClient />
    </CityModal>
  );
}
