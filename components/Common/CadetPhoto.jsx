"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { getCadetPhotoAlt, getCadetPhotoPath } from "@/lib/cadetPhotos";

const SIZE_CLASSES = {
  result: "w-20 min-[375px]:w-24 sm:w-28 print:w-20",
  performer: "w-12 min-[375px]:w-14",
  compact: "w-10",
};

export default function CadetPhoto({
  kitNo,
  name,
  size = "performer",
  loading = "lazy",
  className = "",
}) {
  const src = getCadetPhotoPath(kitNo);
  const alt = getCadetPhotoAlt(name, kitNo);
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  return (
    <div
      className={`${SIZE_CLASSES[size] || SIZE_CLASSES.performer} aspect-[3/4] shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-slate-100 shadow-sm dark:border-slate-700 dark:bg-slate-800 print:border-gray-400 print:bg-gray-100 ${className}`}
    >
      {!failed ? (
        <img
          src={src}
          alt={alt}
          width="300"
          height="400"
          loading={loading}
          decoding="async"
          data-cadet-photo="true"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={`${alt} unavailable; default silhouette shown`}
          className="flex h-full w-full items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 text-slate-500 dark:from-slate-800 dark:to-slate-900 dark:text-slate-400 print:from-gray-100 print:to-gray-200 print:text-gray-500"
        >
          <UserRound aria-hidden="true" className="h-1/2 w-1/2" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
