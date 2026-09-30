"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Printer, ImageDown, Share2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Struk } from "@/components/Struk";
import type { Order } from "@/lib/types";

/**
 * Tombol "Tampilkan Struk": pratinjau, cetak fisik (A5), simpan foto, atau bagikan.
 * Foto disimpan dengan nama nomor resi.
 */
export function StrukDialog({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const file = `${order.orderNumber}.png`;

  /**
   * Cetak lewat jendela terpisah yang isinya cuma struk.
   *
   * window.print() biasa tidak bisa dipakai: struk hidup di dalam portal dialog
   * yang `position: fixed`, jadi `top:0` pada struk menempel ke dialog, bukan ke
   * halaman - PDF hasilnya 3 halaman A5. Dengan halaman bersih sendiri tidak ada
   * posisi dialog atau overflow container yang perlu dilawan.
   */
  function print() {
    const src = document.getElementById("struk");
    if (!src) {
      toast.error("Struk tidak ditemukan.");
      return;
    }

    const w = window.open("", "_blank", "width=760,height=1000");
    if (!w) {
      toast.error("Jendela cetak diblokir peramban. Izinkan pop-up lalu coba lagi.");
      return;
    }

    const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map((l) => (l as HTMLLinkElement).outerHTML)
      .join("");
    const inline = [...document.querySelectorAll("style")]
      .map((s) => s.outerHTML)
      .join("");

    // A4: lebar cetak 190mm > 460px struk, tinggi cetak 277mm > 842px struk -> muat satu lembar.
    const css = [
      "@page { size: A4; margin: 10mm; }",
      "html, body { margin: 0; padding: 0; background: #fff; }",
      "@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }",
    ].join("\n");

    w.document.open();
    w.document.write(
      '<!doctype html><html lang="id"><head><meta charset="utf-8">' +
        `<title>Struk ${order.orderNumber}</title>` +
        `${sheets}${inline}` +
        `<style>${css}</style></head><body>${src.outerHTML}</body></html>`
    );
    w.document.close();
    w.focus();
    window.setTimeout(() => w.print(), 500);
  }

  /**
   * Potret struk ke PNG.
   *
   * Elemen aslinya duduk di dalam `overflow-x-auto` (pratinjau mobile) sehingga
   * html-to-image ikut memotong di 344px dari lebar 460px: kolom Harga, S&K poin 6,
   * dan slogan kanan hilang. Maka disalin dulu ke wadah lepas di luar segala
   * container ber-scroll/animasi, baru dirasterisasi di sana.
   */
  async function render(): Promise<string> {
    const source = document.getElementById("struk");
    if (!source) throw new Error("Struk tidak ditemukan");

    const stage = document.createElement("div");
    stage.setAttribute("aria-hidden", "true");
    stage.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:0",
      "width:460px",
      "background:#ffffff",
      "overflow:visible",
      "pointer-events:none",
      "z-index:-1",
    ].join(";");
    document.body.appendChild(stage);

    const clone = source.cloneNode(true) as HTMLElement;
    clone.id = "struk-export";
    clone.style.margin = "0";
    clone.style.transform = "none";
    clone.style.width = "460px";
    clone.style.position = "relative";
    stage.appendChild(clone);

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      // satu frame supaya layout sudah stabil sebelum diukur
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const width = clone.offsetWidth;
      const height = clone.offsetHeight;

      return await toPng(clone, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        width,
        height,
        style: { width: `${width}px`, height: `${height}px`, transform: "none", margin: "0" },
        cacheBust: true,
      });
    } finally {
      stage.remove();
    }
  }

  async function download() {
    setBusy(true);
    try {
      const dataUrl = await render();
      const a = document.createElement("a");
      a.download = file;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`Foto disimpan: ${file}`);
    } catch {
      toast.error("Gagal membuat foto struk.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      const dataUrl = await render();
      const blob = await (await fetch(dataUrl)).blob();
      const f = new File([blob], file, { type: "image/png" });

      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], title: `Struk ${order.orderNumber}` });
        toast.success("Struk dibagikan.");
        return;
      }
      // Perangkat tidak mendukung share file -> unduh saja.
      const a = document.createElement("a");
      a.download = file;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`Perangkat tidak mendukung berbagi foto. Diunduh: ${file}`);
    } catch (err) {
      // Pengguna membatalkan share sheet menampilkan AbortError - bukan kegagalan.
      if ((err as { name?: string })?.name === "AbortError") {
        toast.info("Berbagi dibatalkan.");
      } else {
        toast.error("Gagal membagikan struk.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileText size={15} strokeWidth={1.75} /> Tampilkan Struk
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="tabular">Struk {order.orderNumber}</DialogTitle>
          <DialogDescription>
            Pratinjau sama seperti form cetak Rossy. Bisa dicetak (A5), disimpan sebagai foto,
            atau dibagikan.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 overflow-x-auto rounded-lg border border-border bg-muted p-3 sm:p-5">
          <div className="shadow-[0_2px_14px_rgba(0,0,0,0.18)]">
            <Struk order={order} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={print} className="gap-2">
            <Printer size={15} strokeWidth={1.75} /> Cetak
          </Button>
          <Button variant="outline" onClick={download} disabled={busy} className="gap-2">
            <ImageDown size={15} strokeWidth={1.75} />
            {busy ? "Menyiapkan..." : "Simpan foto"}
          </Button>
          <Button variant="outline" onClick={share} disabled={busy} className="gap-2">
            <Share2 size={15} strokeWidth={1.75} /> Bagikan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
