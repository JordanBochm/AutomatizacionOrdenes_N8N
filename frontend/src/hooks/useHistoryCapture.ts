"use client";

import { useCallback, useMemo } from "react";
import {
  getHistoryRepository,
  localDateId,
  normalizeCarrier,
  type HistoryClosingEntry,
  type HistoryDay,
  type HistoryMetrics,
  type HistoryTrackingEntry,
  type HistoryUpsertMeta,
} from "@/lib/history";

export interface TrackingCaptureInput {
  guia: string;
  carrier?: string | null;
  estatus_general?: string;
  estatus?: string;
  eventos?: number | Array<unknown>;
  consultado_en?: string;
}

export interface ClosingCaptureInput {
  cierre_file?: string;
  etiquetas_file?: string;
  total_orders?: number;
  assigned?: number;
  errors?: number;
  cp_alerts?: number;
}

export interface BatchCaptureInput {
  date?: string;
  batch_filename?: string;
  metrics?: Partial<HistoryMetrics>;
  user_email?: string;
}

export interface SnapshotCaptureInput extends BatchCaptureInput {
  trackings?: TrackingCaptureInput[];
  closing?: ClosingCaptureInput;
  archived?: boolean;
}

function toTrackingEntry(input: TrackingCaptureInput): HistoryTrackingEntry | null {
  const guia = String(input?.guia || "").trim();
  if (!guia) return null;
  const eventos =
    typeof input.eventos === "number"
      ? input.eventos
      : Array.isArray(input.eventos)
        ? input.eventos.length
        : undefined;
  return {
    guia,
    carrier: normalizeCarrier(input.carrier),
    estatus: input.estatus_general || input.estatus || "DESCONOCIDO",
    eventos,
    consultado_en: input.consultado_en || new Date().toISOString(),
  };
}

function toClosingEntry(input: ClosingCaptureInput): HistoryClosingEntry {
  return {
    cierre_file: input?.cierre_file,
    etiquetas_file: input?.etiquetas_file,
    total_orders: Number(input?.total_orders) || 0,
    assigned: Number(input?.assigned) || 0,
    errors: Number(input?.errors) || 0,
    cp_alerts: Number(input?.cp_alerts) || 0,
  };
}

export function useHistoryCapture(userEmail?: string) {
  const repository = useMemo(() => getHistoryRepository(), []);

  const captureTrackings = useCallback(
    async (items: TrackingCaptureInput[], meta?: HistoryUpsertMeta): Promise<HistoryDay | null> => {
      try {
        const entries = (items || [])
          .map((item) => toTrackingEntry(item))
          .filter((entry): entry is HistoryTrackingEntry => entry !== null);
        if (entries.length === 0) return null;
        return await repository.upsertTrackings(entries, {
          date: meta?.date || localDateId(),
          user_email: userEmail,
          ...meta,
        });
      } catch {
        return null;
      }
    },
    [repository, userEmail]
  );

  const captureClosing = useCallback(
    async (payload: ClosingCaptureInput, meta?: HistoryUpsertMeta): Promise<HistoryDay | null> => {
      try {
        return await repository.upsertClosing(toClosingEntry(payload), {
          date: meta?.date || localDateId(),
          user_email: userEmail,
          ...meta,
        });
      } catch {
        return null;
      }
    },
    [repository, userEmail]
  );

  const captureBatch = useCallback(
    async (payload: BatchCaptureInput = {}): Promise<HistoryDay | null> => {
      try {
        return await repository.upsertBatch({
          id: payload.date || localDateId(),
          date: payload.date || localDateId(),
          batch_filename: payload.batch_filename,
          metrics: payload.metrics,
          user_email: payload.user_email || userEmail,
        });
      } catch {
        return null;
      }
    },
    [repository, userEmail]
  );

  const captureArchive = useCallback(
    async (id?: string): Promise<void> => {
      try {
        await repository.markArchived(id);
      } catch {
        // La captura del historial nunca debe interrumpir la operación.
      }
    },
    [repository]
  );

  const captureSnapshot = useCallback(
    async (payload: SnapshotCaptureInput = {}): Promise<HistoryDay | null> => {
      let last: HistoryDay | null = null;
      if (payload.trackings && payload.trackings.length > 0) {
        last = await captureTrackings(payload.trackings, {
          date: payload.date,
          batch_filename: payload.batch_filename,
          metrics: payload.metrics,
          user_email: payload.user_email,
        });
      }
      if (payload.closing) {
        last = await captureClosing(payload.closing, {
          date: payload.date,
          batch_filename: payload.batch_filename,
          metrics: payload.metrics,
          user_email: payload.user_email,
        });
      }
      if (!payload.trackings?.length && !payload.closing) {
        last = await captureBatch(payload);
      }
      if (payload.archived) {
        await captureArchive(payload.date);
      }
      return last;
    },
    [captureArchive, captureBatch, captureClosing, captureTrackings]
  );

  return { captureTrackings, captureClosing, captureBatch, captureArchive, captureSnapshot };
}
