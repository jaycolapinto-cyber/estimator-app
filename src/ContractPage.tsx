// src/ContractPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ContractPage.css";

type PricingItemRow = any;

type ConstructionSowKey =
  | "new_construction"
  | "resurface"
  | "second_story"
  | "second_story_resurface"
  | "sleeper_system"
  | "second_story_sleeper";

function toSowKey(raw: string): ConstructionSowKey | "" {
  const v = (raw || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  if (v.includes("second") && v.includes("resurface"))
    return "second_story_resurface";
  if (v.includes("second") && v.includes("sleeper"))
    return "second_story_sleeper";
  if (v.includes("second")) return "second_story";
  if (v.includes("sleeper")) return "sleeper_system";
  if (v.includes("resurface") || v.includes("redeck")) return "resurface";
  if (v.includes("new")) return "new_construction";
  return "";
}

type Props = {
    estimateId: string;
  orgId: string | null;
  finalEstimate: number;
  selectedDecking: any;
  selectedRailing: any;
  selectedStairOption: any;
  selectedFastener: any;
  selectedConstruction: any;
  selectedDemo?: any;
  constructionKey?: string;
  constructionType?: string;
  clientTitle?: string;
  selectedSkirting?: any;
  clientLastName?: string;
  clientLocation?: string;
  clientEmail?: string;
  demoType?: string | null;
  demoDescription?: string | null;
  addItemsDetailed?: any;
};

const numberToWords = (num: number): string => {
  if (!Number.isFinite(num) || num <= 0) return "";
  const belowTwenty = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const thousandPowers = ["", "Thousand", "Million", "Billion"];

  const chunkToWords = (n: number) => {
    let out = "";
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    if (hundred) out += `${belowTwenty[hundred]} Hundred`;
    if (rest) {
      if (out) out += " ";
      if (rest < 20) out += belowTwenty[rest];
      else {
        const t = Math.floor(rest / 10);
        const u = rest % 10;
        out += tens[t];
        if (u) out += ` ${belowTwenty[u]}`;
      }
    }
    return out;
  };

  let n = Math.floor(num);
  let power = 0;
  let words: string[] = [];
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) {
      const chunkWords = chunkToWords(chunk);
      const label = thousandPowers[power];
      words.unshift(label ? `${chunkWords} ${label}` : chunkWords);
    }
    n = Math.floor(n / 1000);
    power += 1;
  }
  return words.join(" ").trim();
};

export default function ContractPage(props: Props) {
  const docRef = useRef<HTMLDivElement | null>(null);
  const prevEstimateIdRef = useRef<string>("");
  const prevAutoSpecRef = useRef<string>("");
  const HEADER_KEY = useMemo(() => {
    const id = (props.estimateId || "").trim();
    if (id) return `du_contract_header::${id}`;
    if (typeof window !== "undefined") {
      const temp = window.sessionStorage.getItem("du_contract_temp_key") || "";
      if (temp) return `du_contract_header::${temp}`;
      const generated = `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem("du_contract_temp_key", generated);
      return `du_contract_header::${generated}`;
    }
    return "du_contract_header::default";
  }, [props.estimateId]);

  const SPEC_KEY = useMemo(() => {
    const id = (props.estimateId || "").trim();
    if (id) return `du_contract_spec::${id}`;
    if (typeof window !== "undefined") {
      const temp = window.sessionStorage.getItem("du_contract_temp_key") || "";
      if (temp) return `du_contract_spec::${temp}`;
      const generated = `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem("du_contract_temp_key", generated);
      return `du_contract_spec::${generated}`;
    }
    return "du_contract_spec::default";
  }, [props.estimateId]);

  const STATE_KEY = useMemo(() => {
    const id = (props.estimateId || "").trim();
    if (id) return `du_contract_state::${id}`;
    if (typeof window !== "undefined") {
      const temp = window.sessionStorage.getItem("du_contract_temp_key") || "";
      if (temp) return `du_contract_state::${temp}`;
      const generated = `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem("du_contract_temp_key", generated);
      return `du_contract_state::${generated}`;
    }
    return "du_contract_state::default";
  }, [props.estimateId]);
  // Editable fields
  const [deposit, setDeposit] = useState<number>(1000);
  const [priceOverride, setPriceOverride] = useState<number | "">("");
  const [startDate, setStartDate] = useState<string>("");
  const [duration, setDuration] = useState<string>("");

  // Payment Terms (editable)
  const [paymentScheduleText, setPaymentScheduleText] = useState<string>(
    "$1,000 deposit with contract. Balance upon completion."
  );
  const [paymentMode, setPaymentMode] = useState<"basic" | "staged">("basic");
  const [paymentPercents, setPaymentPercents] = useState({
    deposit: 10,
    dayOne: 30,
    afterDecking: 30,
    holdback: 0,
  });
  const [paymentLabels, setPaymentLabels] = useState({
    deposit: "Deposit",
    dayOne: "Day one",
    afterDecking: "After decking completed",
    holdback: "Holdback after final inspection",
    balance: "Balance upon completion",
  });
  const [forcePageBreak, setForcePageBreak] = useState(false);
  const [contractSumWords, setContractSumWords] = useState<string>("");
  const [contractSumNumerals, setContractSumNumerals] = useState<string>("");
  const [legalDisclaimerText, setLegalDisclaimerText] = useState<string>(
    "All material is guaranteed to be specified. All work to be completed in a work-manlike manner according to standard practices.\n\nThe buyer is responsible for all permits and C.O.’s unless otherwise specified. Decks Unique Inc. is not responsible for weathering, shrinkage or growth on materials, or any underground utilities that may be damaged.\n\nAll agreements contingent upon strikes, accidents or delays beyond our control. There will be a labor charge for any warrantee claim.\n\nIn the event of any litigation to enforce the terms of this contract the unsuccessful party will reimburse the other party for all costs, including reasonable attorney fees."
  );
  // Header (manual fill-in fields — NOT auto-populated)
  const [hdrClient, setHdrClient] = useState<string>("");
  const [hdrAddress, setHdrAddress] = useState<string>("");
  const [hdrCity, setHdrCity] = useState<string>("");
  const [hdrState, setHdrState] = useState<string>("");
  const [hdrZip, setHdrZip] = useState<string>("");
  const [hdrPhone, setHdrPhone] = useState<string>("");
  const [hdrDate, setHdrDate] = useState<string>(new Date().toLocaleDateString());
  const [hdrPageNum, setHdrPageNum] = useState<string>("1");
  const [hdrPageOf, setHdrPageOf] = useState<string>("1");
  const [hdrApproxStart, setHdrApproxStart] = useState<string>("");
  const [hdrApproxEnd, setHdrApproxEnd] = useState<string>("");
  const [hdrEssence, setHdrEssence] = useState<"yes" | "not" | "">("not");

  // Capital Improvement (ST-124)
  const [includeCapitalImprovement, setIncludeCapitalImprovement] = useState<boolean>(false);
  const [ciDescription, setCiDescription] = useState<string>("Build new deck and railings.");
  const [ciProjectName, setCiProjectName] = useState<string>("");
  const [ciWorkAddress, setCiWorkAddress] = useState<string>("");
  const [ciCity, setCiCity] = useState<string>("");
  const [ciState, setCiState] = useState<string>("");
  const [ciZip, setCiZip] = useState<string>("");

  // Body
  // Load saved spec synchronously so saved user edits are not overwritten by auto-seed on mount
  const computeInitialSpec = () => {
    try {
      if (typeof window === 'undefined') return "";
      const raw = localStorage.getItem(SPEC_KEY) || "";
      if (!raw) return "";
      const saved = JSON.parse(raw);
      return String(saved?.text || "");
    } catch {
      return "";
    }
  };
  const [specificationText, setSpecificationText] = useState<string>(computeInitialSpec());
  const [specificationTouched, setSpecificationTouched] = useState<boolean>(false);
  const specHasSavedRef = useRef<boolean>(false);

// ✅ Per-estimate persistence (keyed by estimateId)
// Load when switching files
useEffect(() => {
  try {
    const raw = localStorage.getItem(HEADER_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      setHdrClient(saved?.hdrClient || "");
      setHdrAddress(saved?.hdrAddress || "");
      setHdrCity(saved?.hdrCity || "");
      setHdrState(saved?.hdrState || "");
      setHdrZip(saved?.hdrZip || "");
      setHdrPhone(saved?.hdrPhone || "");
      setHdrDate(saved?.hdrDate || new Date().toLocaleDateString());
      setHdrPageNum(saved?.hdrPageNum || "1");
      setHdrPageOf(saved?.hdrPageOf || "1");
      setHdrApproxStart(saved?.hdrApproxStart || "");
      setHdrApproxEnd(saved?.hdrApproxEnd || "");
      setHdrEssence(saved?.hdrEssence || "not");
    }
  } catch {}
}, [HEADER_KEY]);

useEffect(() => {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved?.paymentScheduleText !== undefined) {
      setPaymentScheduleText(saved.paymentScheduleText || "");
    }
    if (saved?.paymentMode === "basic" || saved?.paymentMode === "staged") {
      setPaymentMode(saved.paymentMode);
    }
    if (saved?.paymentPercents) {
      setPaymentPercents((prev) => ({
        ...prev,
        ...saved.paymentPercents,
      }));
    }
    if (saved?.paymentLabels) {
      setPaymentLabels((prev) => ({
        ...prev,
        ...saved.paymentLabels,
      }));
    }
    if (saved?.contractSumNumerals !== undefined) {
      setContractSumNumerals(saved.contractSumNumerals || "");
    }
    if (saved?.contractSumWords !== undefined) {
      setContractSumWords(saved.contractSumWords || "");
    }
    if (saved?.legalDisclaimerText !== undefined) {
      setLegalDisclaimerText(saved.legalDisclaimerText || "");
    }
  } catch {}
}, [STATE_KEY]);

useEffect(() => {
  try {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        paymentScheduleText,
        paymentMode,
        paymentPercents,
        paymentLabels,
        contractSumNumerals,
        contractSumWords,
        legalDisclaimerText,
      })
    );
  } catch {}
}, [
  STATE_KEY,
  paymentScheduleText,
  paymentMode,
  paymentPercents,
  contractSumNumerals,
  contractSumWords,
  legalDisclaimerText,
]);

useEffect(() => {
  try {
    const raw = localStorage.getItem(SPEC_KEY) || "";
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved?.text !== undefined) {
        const text = String(saved.text || "");
        if (text.toLowerCase().includes("asdsada") || text.toLowerCase().includes("asdad")) {
          localStorage.removeItem(SPEC_KEY);
          setSpecificationText("");
          setSpecificationTouched(false);
          specHasSavedRef.current = false;
          return;
        }
        setSpecificationText(text);
        // If there's any saved text, treat as touched to prevent auto-overwrite
        const hasSaved = !!text;
        specHasSavedRef.current = hasSaved;
        setSpecificationTouched(!!saved.touched || hasSaved);
      }
    }
  } catch {}
}, [SPEC_KEY]);

// Auto-fill CI form from header (lightweight)
useEffect(() => {
  if (hdrClient) {
    // no state change needed; uses hdrClient directly in render
  }
  if (!ciWorkAddress && hdrAddress) {
    setCiWorkAddress(hdrAddress);
  }
}, [hdrClient, hdrAddress]);

// Save on change
useEffect(() => {
  if (!HEADER_KEY) return;
  try {
    localStorage.setItem(
      HEADER_KEY,
      JSON.stringify({
        hdrClient,
        hdrAddress,
        hdrCity,
        hdrState,
        hdrZip,
        hdrPhone,
        hdrDate,
        hdrPageNum,
        hdrPageOf,
        hdrApproxStart,
        hdrApproxEnd,
        hdrEssence,
      })
    );
  } catch {}
}, [
  HEADER_KEY,
  hdrClient,
  hdrAddress,
  hdrPhone,
  hdrDate,
  hdrPageNum,
  hdrPageOf,
  hdrApproxStart,
  hdrApproxEnd,
  hdrEssence,
]);

const persistSpecification = useCallback(
  (text: string, touched: boolean) => {
    if (!SPEC_KEY) return;
    try {
      localStorage.setItem(
        SPEC_KEY,
        JSON.stringify({ text: text || "", touched })
      );
    } catch {}
  },
  [SPEC_KEY]
);

const markSpecificationTouchedAndPersist = useCallback(
  (text: string) => {
    setSpecificationTouched(true);
    setSpecificationText(text);
    persistSpecification(text, true);
  },
  [persistSpecification]
);

useEffect(() => {
  persistSpecification(specificationText, specificationTouched);
}, [persistSpecification, specificationText, specificationTouched]);

useEffect(() => {
  if (typeof window === "undefined") return;

  const flushSpecification = () => {
    persistSpecification(specificationText, specificationTouched || !!specificationText);
  };

  window.addEventListener("pagehide", flushSpecification);
  document.addEventListener("visibilitychange", flushSpecification);

  return () => {
    window.removeEventListener("pagehide", flushSpecification);
    document.removeEventListener("visibilitychange", flushSpecification);
  };
}, [persistSpecification, specificationText, specificationTouched]);

  const contractPrice = useMemo(() => {
    const base = Number(props.finalEstimate) || 0;
    const override = priceOverride === "" ? null : Number(priceOverride);
    return override != null && !Number.isNaN(override) ? override : base;
  }, [props.finalEstimate, priceOverride]);

  const storedUserSettings = useMemo(() => {
    const tryRead = (key: string) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    return (
      tryRead("userSettings") ||
      tryRead("du_user_settings") ||
      tryRead("duUserSettings") ||
      null
    );
  }, []);

  const companyName = useMemo(() => {
    return (
      (storedUserSettings?.organizationName || storedUserSettings?.orgName || storedUserSettings?.companyName || "").trim() ||
      "Decks Unique"
    );
  }, [storedUserSettings]);

  const companyLogo = useMemo(() => {
    return String(storedUserSettings?.logoDataUrl || "").trim();
  }, [storedUserSettings]);

  const companyTagline = useMemo(() => {
    return String(storedUserSettings?.logoSlogan || "Pride and Quality Make Decks Unique").trim();
  }, [storedUserSettings]);

  const addOnLabels = useMemo(() => {
    const items = (props.addItemsDetailed || [])
      .map((row: any) => {
        const pickedDesc = row?.picked?.proposal_description || "";
        const picked = row?.picked?.name || row?.picked?.label || "";
        const customName = row?.customName || "";
        const customDesc = row?.customDescription || "";
        const qty = Number(row?.qty ?? row?.quantity ?? row?.lineQty ?? 0);
        const lineBase = Number(row?.lineBase || 0);
        const customPrice = Number(row?.customPrice || 0);

        const label = (pickedDesc || customDesc || customName || picked || "").toString().trim();
        if (!label) return "";

        // Only include add-ons that were actually selected
        if (qty <= 0 && lineBase <= 0 && customPrice <= 0) return "";

        const qtyText = qty ? ` (x${qty})` : "";
        return `${label}${qtyText}`;
      })
      .filter((item: string) => item.trim() !== "");

    return Array.from(new Set(items));
  }, [props.addItemsDetailed]);

  const autoSpecification = useMemo(() => {
    const lines: string[] = [];

    const getSowTemplateBody = (key: ConstructionSowKey | "") => {
      if (!key || typeof window === "undefined") return "";
      try {
        const raw = window.localStorage.getItem("du_sow_templates_v1") || "";
        if (!raw) return "";
        const map = JSON.parse(raw) as Record<string, string>;
        return map?.[key] || "";
      } catch {
        return "";
      }
    };

    const extractStairsLine = (body: string) => {
      if (!body) return "";
      const lines = body.split("\n").map((line) => line.trim());
      const match = lines.find((line) => line.toLowerCase().startsWith("stairs"));
      return match || "";
    };

    const add = (s?: string | null) => {
      const t = (s || "").trim();
      if (t) lines.push(t);
    };

    add(
      "New deck to be built as per the sketch plans and 3D renderings that will be emailed prior for approval"
    );

    const demoName = (props.demoType || "").trim();
    const demoBlurb = (props.demoDescription || "").trim();
    if (demoBlurb) {
      add(`Demolition: ${demoBlurb}`);
    } else if (demoName) {
      add(`Demolition: ${demoName} — Removal and disposal of existing materials as required.`);
    }

    // Ordered scope lines (Decking → Fasteners → Railing → Skirting)
    const decking = (props.selectedDecking?.name || props.selectedDecking?.label || "").trim();
    const fastener = (props.selectedFastener?.name || props.selectedFastener?.label || "").trim();
    const railing = (props.selectedRailing?.name || props.selectedRailing?.label || "").trim();
    const skirting = (props.selectedSkirting?.name || props.selectedSkirting?.label || "").trim();
    const stairs = (props.selectedStairOption?.name || props.selectedStairOption?.label || "").trim();

    const construction = (props.constructionType || "").trim().toLowerCase();
    let deckStructureLine = "";
    if (construction === "new construction" || construction === "second story") {
      deckStructureLine =
        'Deck Structure: 14"x36" poured concrete footings with KDAT 4x4 support posts and 2x8 floor joists installed 16" on center. All hardware (tecos, bolts, strapping) to be hot-dipped galvanized.';
    } else if (construction === "resurface" || construction === "second story resurface") {
      deckStructureLine =
        "Deck Structure: Existing deck framing to remain. Any compromised framing will be repaired or replaced as needed. All new decking/railing will be installed per code and manufacturer specifications.";
    } else if (construction === "sleeper" || construction === "second story sleeper") {
      deckStructureLine =
        "Deck Structure: Remove existing structure. Sleeper system installed to establish proper pitch and drainage. Decking installed per manufacturer requirements.";
    }

    if (deckStructureLine) add(deckStructureLine);

    if (decking) add(`New decking to be installed will be ${decking}, color to be determined.`);
    if (fastener) {
      const fastenerLower = fastener.toLowerCase();
      const fastenerLine = fastenerLower.includes("hidden") || fastenerLower.includes("clip")
        ? "Decking to be secured with Tiger Claw black-coated stainless steel hidden clips."
        : fastenerLower.includes("nail")
          ? "Decking to be secured with hot-dipped galvanized nails."
          : fastenerLower.includes("scrail")
            ? "Decking to be secured with stainless steel scrails (gun-driven fasteners combining the holding power of a screw with the speed of a nail)."
            : fastenerLower.includes("screw")
              ? "Decking to be secured with color-matched stainless steel screws."
              : `Fasteners: ${fastener}.`;
      add(fastenerLine);
    }
    if (railing) {
      const railingLower = railing.toLowerCase();
      const isTrexSelectFlatTop =
        railingLower.includes("trex") &&
        railingLower.includes("select") &&
        railingLower.includes("flat");
      const detail = isTrexSelectFlatTop ? " with black round aluminum spindles" : "";
      const colorNote = isTrexSelectFlatTop ? "" : ", color to be determined";
      add(`New railing to be installed will be ${railing}${detail}${colorNote}.`);
    }

    if (stairs) {
      const stairBlurb = (props.selectedStairOption?.proposal_description || "").trim();
      add(stairBlurb ? `Stairs: ${stairBlurb}` : `Stairs: ${stairs}.`);
    }

    if (skirting) {
      const skirtingLower = skirting.toLowerCase();
      const skirtingLine = skirtingLower.includes("lattice")
        ? "Underside of deck to be covered using small diamond vinyl lattice, color TBD, with matching decking picture frame trim."
        : "Underside of deck to be skirted using matching deck boards installed vertically.";
      add(skirtingLine);
    }

    // Add-on items (list as-is)
    addOnLabels.forEach((item) => add(item as string));

    return Array.from(new Set(lines)).join("\n");
  }, [
    props.demoType,
    props.demoDescription,
    props.selectedDecking,
    props.selectedFastener,
    props.selectedRailing,
    props.selectedStairOption,
    props.selectedSkirting,
    companyName,
  ]);

  useEffect(() => {
    const prevAuto = prevAutoSpecRef.current;
    const shouldSync = !specificationTouched || specificationText === prevAuto;
    if (shouldSync) {
      setSpecificationText(autoSpecification);
    }
    prevAutoSpecRef.current = autoSpecification;
  }, [autoSpecification, specificationTouched, specificationText]);

  useEffect(() => {
    const id = (props.estimateId || "").trim();
    if (!id) return;
    // When switching to a real estimate, re-seed the spec if user hasn't edited it.
    if (!specificationTouched) {
      specHasSavedRef.current = false;
      setSpecificationText(autoSpecification);
    }
  }, [props.estimateId, autoSpecification, specificationTouched]);

  useEffect(() => {
    const currentId = (props.estimateId || "").trim();
    const prevId = prevEstimateIdRef.current;
    prevEstimateIdRef.current = currentId;

    // Only reset temp data when transitioning from a real estimateId to a new blank file
    if (prevId && !currentId && typeof window !== "undefined") {
      const prevTemp = window.sessionStorage.getItem("du_contract_temp_key") || "";
      if (prevTemp) {
        localStorage.removeItem(`du_contract_header::${prevTemp}`);
        localStorage.removeItem(`du_contract_spec::${prevTemp}`);
      }

      const newTemp = `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem("du_contract_temp_key", newTemp);

      setHdrClient("");
      setHdrAddress("");
      setHdrPhone("");
      setHdrDate(new Date().toLocaleDateString());
      setHdrPageNum("1");
      setHdrPageOf("1");
      setHdrApproxStart("");
      setHdrApproxEnd("");
      setHdrEssence("not");

      setSpecificationText(autoSpecification);
      setSpecificationTouched(false);
      specHasSavedRef.current = false;
    }
  }, [props.estimateId, autoSpecification]);

  // Guard: if user text exists, lock as touched (prevents re-seeding)
  useEffect(() => {
    if (specificationText && !specificationTouched) {
      setSpecificationTouched(true);
    }
  }, [specificationText, specificationTouched]);


  const printContract = () => window.print();

  const specLineCount = useMemo(() => {
    return specificationText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "").length;
  }, [specificationText]);

  const handleSaveContract = () => {
    try {
      localStorage.setItem(
        HEADER_KEY,
        JSON.stringify({
          hdrClient,
          hdrAddress,
          hdrCity,
          hdrState,
          hdrZip,
          hdrPhone,
          hdrDate,
          hdrPageNum,
          hdrPageOf,
          hdrApproxStart,
          hdrApproxEnd,
          hdrEssence,
        })
      );
      localStorage.setItem(
        SPEC_KEY,
        JSON.stringify({ text: specificationText || "", touched: true })
      );
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          paymentScheduleText,
          paymentMode,
          paymentPercents,
          contractSumNumerals,
          contractSumWords,
          legalDisclaimerText,
        })
      );
    } catch {}
  };

  const handleClearContract = () => {
    try {
      localStorage.removeItem(HEADER_KEY);
      localStorage.removeItem(SPEC_KEY);
      localStorage.removeItem(STATE_KEY);
    } catch {}

    setHdrClient("");
    setHdrAddress("");
    setHdrCity("");
    setHdrState("");
    setHdrZip("");
    setHdrPhone("");
    setHdrDate(new Date().toLocaleDateString());
    setHdrPageNum("1");
    setHdrPageOf("1");
    setHdrApproxStart("");
    setHdrApproxEnd("");
    setHdrEssence("not");

    setSpecificationText(autoSpecification);
    setSpecificationTouched(false);
    specHasSavedRef.current = false;

    setPaymentScheduleText("$1,000 deposit with contract. Balance upon completion.");
    setPaymentMode("basic");
    setPaymentPercents({ deposit: 10, dayOne: 30, afterDecking: 30, holdback: 0 });
    setPaymentLabels({
      deposit: "Deposit",
      dayOne: "Day one",
      afterDecking: "After decking completed",
      holdback: "Holdback after final inspection",
      balance: "Balance upon completion",
    });
    setContractSumNumerals("");
    setContractSumWords("");
    setLegalDisclaimerText(
      "All material is guaranteed to be specified. All work to be completed in a work-manlike manner according to standard practices.\n\nThe buyer is responsible for all permits and C.O.’s unless otherwise specified. Decks Unique Inc. is not responsible for weathering, shrinkage or growth on materials, or any underground utilities that may be damaged.\n\nAll agreements contingent upon strikes, accidents or delays beyond our control. There will be a labor charge for any warrantee claim.\n\nIn the event of any litigation to enforce the terms of this contract the unsuccessful party will reimburse the other party for all costs, including reasonable attorney fees."
    );
  };

  return (
    <div className="contract-page">
      <div className="contract-actions no-print">
        <div className="contract-actions-group">
          <button className="du-btn" onClick={printContract}>
            Print Contract
          </button>
          <label className="contract-ci-toggle">
            <input
              type="checkbox"
              checked={forcePageBreak}
              onChange={(e) => setForcePageBreak(e.target.checked)}
            />
            <span>Force Page 2</span>
          </label>
        </div>
        <div className="contract-actions-group">
          <button className="du-btn du-btn-primary" onClick={handleSaveContract}>
            Save
          </button>
          <button className="du-btn du-btn-danger" onClick={handleClearContract}>
            Reset to Defaults
          </button>
        </div>
      </div>

      <div id="contract-doc" className="contract-doc" ref={docRef}>
        <div className="contract-container">
          <header className="contract-header">
            <div className="contract-header-inner">
              {/* LEFT */}
              <div className="contract-frame-left">
                <div className="contract-fieldRow">
                  <div className="contract-fieldLabel">Client</div>
                  <input
                    className="contract-fieldInput"
                    value={hdrClient}
                    onChange={(e) => setHdrClient(e.target.value)}
                    placeholder="Client name"
                  />
                </div>

                <div className="contract-fieldRow">
                  <div className="contract-fieldLabel">Address</div>
                  <input
                    className="contract-fieldInput"
                    value={hdrAddress}
                    onChange={(e) => setHdrAddress(e.target.value)}
                    placeholder="Street address"
                  />
                </div>

                <div className="contract-fieldRow contract-fieldRow--three">
                  <div className="contract-fieldHalf">
                    <div className="contract-fieldLabel">City</div>
                    <input
                      className="contract-fieldInput"
                      value={hdrCity}
                      onChange={(e) => setHdrCity(e.target.value)}
                      placeholder="City"
                    />
                  </div>

                  <div className="contract-fieldHalf">
                    <div className="contract-fieldLabel">State</div>
                    <input
                      className="contract-fieldInput"
                      value={hdrState}
                      onChange={(e) => setHdrState(e.target.value)}
                      placeholder="State"
                    />
                  </div>

                  <div className="contract-fieldHalf">
                    <div className="contract-fieldLabel">ZIP</div>
                    <input
                      className="contract-fieldInput"
                      value={hdrZip}
                      onChange={(e) => setHdrZip(e.target.value)}
                      placeholder="ZIP"
                    />
                  </div>
                </div>

                <div className="contract-fieldRow contract-fieldRow--two">
                  <div className="contract-fieldHalf">
                    <div className="contract-fieldLabel">Phone</div>
                    <input
                      className="contract-fieldInput"
                      value={hdrPhone}
                      onChange={(e) => setHdrPhone(e.target.value)}
                      placeholder="Phone"
                    />
                  </div>

                  <div className="contract-fieldHalf">
                    <div className="contract-fieldLabel">Date</div>
                    <input
                      className="contract-fieldInput"
                      value={hdrDate}
                      onChange={(e) => setHdrDate(e.target.value)}
                      placeholder="Date"
                    />
                  </div>
                </div>
              </div>

              {/* CENTER */}
              <div className="contract-frame-center">
                <div className="contract-frame-top">
                  {companyLogo ? <img className="contract-logo" src={companyLogo} alt={`${companyName} logo`} /> : null}
                  <div className="contract-frame-title">Contract</div>
                  <div className="contract-frame-tagline">"{companyTagline}"</div>
                </div>

                {!companyLogo ? <img className="contract-watermark" src="/DU-watermark.png" alt="" /> : null}

                <div className="contract-frame-company">
                  <div className="contract-company-address">119 Commack Rd, Commack NY 11725</div>
                  <div className="contract-company-phone">631.266.3004</div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="contract-frame-right">
                <div className="contract-pageRow">
                  <span>Page</span>
                  <input
                    className="contract-pageInput"
                    value={hdrPageNum}
                    onChange={(e) => setHdrPageNum(e.target.value)}
                    aria-label="Page number"
                  />
                  <span>Of</span>
                  <input
                    className="contract-pageInput"
                    value={hdrPageOf}
                    onChange={(e) => setHdrPageOf(e.target.value)}
                    aria-label="Total pages"
                  />
                </div>

                <div className="contract-rightBox contract-rightBox--inline">
                  <div className="contract-inlineRow">
                    <span className="contract-inlineLabel">Approximate Start Date</span>
                    <input
                      className="contract-inlineInput"
                      value={hdrApproxStart}
                      onChange={(e) => setHdrApproxStart(e.target.value)}
                      aria-label="Approximate start date"
                    />
                  </div>

                  <div className="contract-inlineRow">
                    <span className="contract-inlineLabel">Approximate End Date</span>
                    <input
                      className="contract-inlineInput"
                      value={hdrApproxEnd}
                      onChange={(e) => setHdrApproxEnd(e.target.value)}
                      aria-label="Approximate end date"
                    />
                  </div>
                </div>

                <div className="contract-rightNote">
                  The Contractor and the owner have determined that a definite completion date:
                  <div className="contract-checkRow contract-checkRow--inline">
                    <label className="contract-checkItem">
                      <input
                        type="checkbox"
                        checked={hdrEssence === "not"}
                        onChange={() => setHdrEssence("not")}
                      />
                      <span>Is Not of the essence</span>
                    </label>

                    <label className="contract-checkItem">
                      <input
                        type="checkbox"
                        checked={hdrEssence === "yes"}
                        onChange={() => setHdrEssence("yes")}
                      />
                      <span>Is of the essence</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* ✅ Contract body */}
          <section className="contract-body">
            {/* Specifications */}
            <div className="contract-section">
              <h2>We hereby submit specification for:</h2>

              <textarea
                className="contract-textarea no-print"
                value={specificationText}
                onChange={(e) => {
                  markSpecificationTouchedAndPersist(e.target.value);
                }}
                onBlur={(e) => {
                  persistSpecification(e.target.value, true);
                }}
                rows={10}
                placeholder="Specifications will auto‑populate here. You can edit each line."
                spellCheck={true}
                autoCorrect="on"
                autoCapitalize="sentences"
                lang="en-US"
              />

              <ul className="contract-scopeList print-only">
                {specificationText
                  .split("\n")
                  .filter((line) => line.trim() !== "")
                  .map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
              </ul>
            </div>

       {/* Bottom stack: Payment + Legal + Acceptance + Cancellation + Licenses */}
{forcePageBreak || specLineCount > 15 ? (
  <div className="contract-page-break print-only" />
) : null}
<div className={`contract-bottom-wrapper${forcePageBreak || specLineCount > 15 ? " force-break" : ""}`}>
  <div className="contract-bottom-stack">
  {/* Sum of + Amount + Payment Schedule */}
  <section className="contract-section contract-section--sum">
    <h2>
      We propose to hereby to furnish material and labor – complete in accordance with the above specifications, for the sum of:
    </h2>

    <div className="contract-sumRow">
      <div className="contract-sumWords">
        <div className="contract-sumLine">
          {contractSumWords ? `${contractSumWords} USD 00/100` : "\u00A0"}
        </div>
      </div>

      <div className="contract-sumInputWrap">
        <label className="contract-sumLabel">($)</label>
        <input
          className="contract-sumInput"
          value={contractSumNumerals}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, "");
            const num = raw ? Number(raw) : 0;
            const formatted = raw ? num.toLocaleString("en-US") : "";
            setContractSumNumerals(formatted);
            setContractSumWords(numberToWords(num));
          }}
          placeholder="25,500"
          inputMode="decimal"
        />
      </div>
      <div className="contract-sumPrint print-only">
        ($) {contractSumNumerals || ""}
      </div>
    </div>

    <div className="contract-payRow">
      <div className="contract-payLabel">PAYMENT SCHEDULE:</div>
      <div className="contract-payToggle no-print">
        <button
          type="button"
          className={`contract-payToggleBtn ${paymentMode === "basic" ? "active" : ""}`}
          onClick={() => setPaymentMode("basic")}
        >
          Basic
        </button>
        <button
          type="button"
          className={`contract-payToggleBtn ${paymentMode === "staged" ? "active" : ""}`}
          onClick={() => setPaymentMode("staged")}
        >
          Staged
        </button>
      </div>

      {paymentMode === "basic" ? (
        <>
          {/* ON SCREEN */}
          <textarea
            className="contract-payValue no-print"
            value={paymentScheduleText}
            onChange={(e) => setPaymentScheduleText(e.target.value)}
            rows={1}
            placeholder="$1,000 deposit with contract. Balance upon completion."
          />

          {/* PRINT */}
          <div className="contract-payValue print-only" style={{ whiteSpace: "pre-wrap" }}>
            {paymentScheduleText}
          </div>
        </>
      ) : (
        <>
          {(() => {
            const total = Number(contractSumNumerals.replace(/[^\d]/g, "")) || 0;
            const pct = paymentPercents;
            const clamp = (value: number) => Math.max(0, Math.min(100, value));
            const depositPct = clamp(pct.deposit);
            const dayOnePct = clamp(pct.dayOne);
            const afterDeckingPct = clamp(pct.afterDecking);
            const holdbackPct = clamp(pct.holdback);
            const balancePct = clamp(100 - depositPct - dayOnePct - afterDeckingPct - holdbackPct);

            const deposit = Math.round((total * depositPct) / 100);
            const dayOne = Math.round((total * dayOnePct) / 100);
            const afterDecking = Math.round((total * afterDeckingPct) / 100);
            const holdback = Math.round((total * holdbackPct) / 100);
            const balance = Math.max(total - deposit - dayOne - afterDecking - holdback, 0);

            const fmt = (value: number) => `$${value.toLocaleString()}`;

            const label = paymentLabels;
            const sentenceParts = [
              `${depositPct}% ${label.deposit.toLowerCase()} (${fmt(deposit)})`,
              `${dayOnePct}% ${label.dayOne.toLowerCase()} (${fmt(dayOne)})`,
              `${afterDeckingPct}% ${label.afterDecking.toLowerCase()} (${fmt(afterDecking)})`,
              holdbackPct ? `${holdbackPct}% ${label.holdback.toLowerCase()} (${fmt(holdback)})` : "",
              `${label.balance} (${fmt(balance)})`,
            ].filter(Boolean);
            const stagedText = sentenceParts.join(", ");

            return (
              <>
                <div className="contract-payValue no-print">
                  <div className="contract-payGrid">
                    <div>
                      <input
                        className="contract-payLabelInput"
                        value={paymentLabels.deposit}
                        onChange={(e) =>
                          setPaymentLabels((prev) => ({
                            ...prev,
                            deposit: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="contract-payPct">
                      <input
                        type="number"
                        value={depositPct}
                        onChange={(e) =>
                          setPaymentPercents((prev) => ({
                            ...prev,
                            deposit: Number(e.target.value || 0),
                          }))
                        }
                      />
                      <span>%</span>
                    </div>
                    <div className="contract-payAmount">({fmt(deposit)})</div>

                    <div>
                      <input
                        className="contract-payLabelInput"
                        value={paymentLabels.dayOne}
                        onChange={(e) =>
                          setPaymentLabels((prev) => ({
                            ...prev,
                            dayOne: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="contract-payPct">
                      <input
                        type="number"
                        value={dayOnePct}
                        onChange={(e) =>
                          setPaymentPercents((prev) => ({
                            ...prev,
                            dayOne: Number(e.target.value || 0),
                          }))
                        }
                      />
                      <span>%</span>
                    </div>
                    <div className="contract-payAmount">({fmt(dayOne)})</div>

                    <div>
                      <input
                        className="contract-payLabelInput"
                        value={paymentLabels.afterDecking}
                        onChange={(e) =>
                          setPaymentLabels((prev) => ({
                            ...prev,
                            afterDecking: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="contract-payPct">
                      <input
                        type="number"
                        value={afterDeckingPct}
                        onChange={(e) =>
                          setPaymentPercents((prev) => ({
                            ...prev,
                            afterDecking: Number(e.target.value || 0),
                          }))
                        }
                      />
                      <span>%</span>
                    </div>
                    <div className="contract-payAmount">({fmt(afterDecking)})</div>

                    <div>
                      <input
                        className="contract-payLabelInput"
                        value={paymentLabels.holdback}
                        onChange={(e) =>
                          setPaymentLabels((prev) => ({
                            ...prev,
                            holdback: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="contract-payPct">
                      <input
                        type="number"
                        value={holdbackPct}
                        onChange={(e) =>
                          setPaymentPercents((prev) => ({
                            ...prev,
                            holdback: Number(e.target.value || 0),
                          }))
                        }
                      />
                      <span>%</span>
                    </div>
                    <div className="contract-payAmount">({fmt(holdback)})</div>

                    <div>
                      <input
                        className="contract-payLabelInput"
                        value={paymentLabels.balance}
                        onChange={(e) =>
                          setPaymentLabels((prev) => ({
                            ...prev,
                            balance: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="contract-payPct">
                      <span>{balancePct}%</span>
                    </div>
                    <div className="contract-payAmount">({fmt(balance)})</div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">{stagedText}</div>
                </div>
                <div className="contract-payValue print-only">
                  {stagedText}
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>

    {/* Legal (editable) */}
    <textarea
      className="contract-legalTextarea no-print"
      value={legalDisclaimerText}
      onChange={(e) =>
        setLegalDisclaimerText(e.target.value.replace(/\n\s*\n/g, "\n"))
      }
    />

    {/* Legal print */}
    <div className="contract-legalText print-only">
      {legalDisclaimerText.replace(/\n+/g, " ").trim()}
    </div>
  </section>

  {/* Acceptance */}
  <section className="contract-section contract-acceptance">
    <p className="contract-acceptance-text">
      <span className="contract-acceptance-title">Acceptance of Proposal:</span> I have read this
      document and accept the prices, specifications and conditions stated. I understand that upon
      signing, this becomes a binding contract. You are authorized to do the work as specified.
      Payment will be made as outline above.
    </p>

    <div className="acceptance-grid">
      {/* LEFT: Client */}
      <div className="acceptance-party">
        <div className="sig-row">
          <div className="sig-col">
            <div className="sig-line" />
            <div className="sig-label">Client Signature</div>
          </div>

          <div className="sig-col sig-col-date">
            <div className="sig-line" />
            <div className="sig-label">Date</div>
          </div>
        </div>
      </div>

      {/* subtle divider */}
      <div className="acceptance-divider" aria-hidden="true" />

      {/* RIGHT: Authorized */}
      <div className="acceptance-party">
        <div className="sig-row">
          <div className="sig-col">
            <div className="sig-line" />
            <div className="sig-label">Authorized Signature</div>
          </div>

          <div className="sig-col sig-col-date">
            <div className="sig-line" />
            <div className="sig-label">Date</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  {/* Cancellation Policy */}
  <section className="contract-cancellation">
    <p className="contract-cancellation-text">
      <span className="contract-cancellation-title">Notice of Cancellation:</span> You, the buyer,
      may cancel at any time prior to the midnight of the third business day after the date of this
      transaction.
    </p>
  </section>

  <footer className="contract-foot">
    <span>Nassau H18607600</span>
    <span>Suffolk 1614-H</span>
  </footer>

</div>
</div>

</section>
        </div>
      </div>
    </div>
  );
}