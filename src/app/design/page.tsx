"use client";

import { useState, type ReactNode } from "react";
import { Plus, Upload, Download, Settings2, Palette, Type, Square, Boxes, Save, Trash2, Pencil, X, ChevronRight } from "lucide-react";
import PageHeader, { HeaderButton } from "@/components/PageHeader";
import PillTabs from "@/components/PillTabs";
import SlidingSwitch from "@/components/SlidingSwitch";
import SaveRow from "@/components/SaveRow";
import SiteCard, { CardTitle, cardClass } from "@/components/Card";
import Button, { IconButton } from "@/components/Button";
import { Input, Select, Textarea, FieldLabel } from "@/components/Field";

// The design system's showcase: every colour, text style, corner, shadow and shared piece the app uses, in one page.
// Hidden (no menu link), opened at /design. It reads nothing from the journal and writes nothing.
// Swatches and pieces are the real ones, so they change here when they change in the app. The hex codes are written
// out for use outside the app (a logo, a drawing): keep them in step with globals.css.

const LABEL = "text-label font-bold text-ink-faint uppercase tracking-widest";

// Tailwind only builds classes it can read whole in the code, so each one is written out in full.
const COLOURS: { group: string; items: { name: string; swatch: string; job: string; hex: string }[] }[] = [
  {
    group: "สีหลัก (ฝั่งดี)",
    items: [
      { name: "accent", swatch: "bg-accent", job: "กำไร, TP, On Plan, ปุ่มหลัก, หน้าที่เปิดอยู่", hex: "#FF8904" },
      { name: "accent-strong", swatch: "bg-accent-strong", job: "ปุ่มหลักตอนชี้เมาส์ (เท่านั้น)", hex: "#FF6900" },
      { name: "accent-soft", swatch: "bg-accent-soft", job: "พื้นอ่อนของสิ่งที่เลือก, กล่องเน้น", hex: "#FFF7ED" },
      { name: "accent-line", swatch: "bg-accent-line", job: "ขอบของกล่องนั้น", hex: "#FFD6A7" },
    ],
  },
  {
    group: "ฝั่งเสีย",
    items: [
      { name: "loss", swatch: "bg-loss", job: "ขาดทุน, SL, Drawdown", hex: "#82181A" },
      { name: "loss-soft", swatch: "bg-loss-soft", job: "พื้นอ่อน", hex: "#FEF2F2" },
      { name: "loss-line", swatch: "bg-loss-line", job: "ขอบ", hex: "#FFC9C9" },
    ],
  },
  {
    group: "ตัวหนังสือ",
    items: [
      { name: "ink", swatch: "bg-ink", job: "ข้อความหลัก, ตัวเลข, หัวเรื่อง", hex: "#0C0A09" },
      { name: "ink-muted", swatch: "bg-ink-muted", job: "ข้อความรอง, คำอธิบาย", hex: "#79716B" },
      { name: "ink-faint", swatch: "bg-ink-faint", job: "ป้ายเล็ก, ไอคอนที่ไม่ได้เลือก", hex: "#A6A09B" },
      { name: "ink-disabled", swatch: "bg-ink-disabled", job: "ปิดอยู่ หรือว่าง", hex: "#D6D3D1" },
    ],
  },
  {
    group: "พื้นและเส้น",
    items: [
      { name: "line", swatch: "bg-line", job: "ขอบการ์ด, เส้นแบ่ง", hex: "#E7E5E4" },
      { name: "line-soft", swatch: "bg-line-soft", job: "เส้นแบ่งอ่อนในการ์ด (แถวรายการ)", hex: "#F5F5F4" },
      { name: "surface-2", swatch: "bg-surface-2", job: "ร่องในการ์ด (ส่วนว่างของแถบ)", hex: "#F5F5F4" },
      { name: "surface", swatch: "bg-surface", job: "พื้นหน้า, กล่องเทา", hex: "#FAFAF9" },
      { name: "card", swatch: "bg-card", job: "การ์ด", hex: "#FFFFFF" },
    ],
  },
];

// The text scale: one name per job (`--text-*` in globals.css). `sample` is how it is written in a page.
const TYPE_SCALE = [
  { name: "display", px: 30, sample: "text-display font-black tracking-tight", text: "Dashboard · $1,234", job: "ชื่อหน้า, ตัวเลขเด่นที่สุด" },
  { name: "figure", px: 24, sample: "text-figure font-black tracking-tight", text: "$1,234.56", job: "ตัวเลขสถิติใหญ่ในการ์ด" },
  { name: "title", px: 18, sample: "text-title font-black", text: "Risk per Trade · ความเสี่ยง", job: "หัวการ์ด, หัวป๊อปอัป" },
  { name: "body", px: 14, sample: "text-body font-semibold", text: "Net Profit · กำไรสุทธิ", job: "ข้อความหลัก, ปุ่ม, แท็บ" },
  { name: "small", px: 12, sample: "text-small font-semibold", text: "24 trades · 15 wins · ชนะ 15", job: "ตัวในตาราง, ข้อความรอง" },
  { name: "caption", px: 11, sample: "text-caption font-semibold", text: "Updated 2 min ago · อัปเดตล่าสุด", job: "หมายเหตุเล็ก, ตัวเลือกเลื่อน, ป้ายในปุ่ม" },
  { name: "label", px: 10, sample: "text-label font-bold uppercase tracking-widest", text: "Win Rate · อัตราชนะ", job: "ป้ายตัวพิมพ์ใหญ่เหนือตัวเลข, หัวตาราง" },
];

// The four weights allowed.
const WEIGHT_SCALE = [
  { name: "regular · 400", cls: "font-normal" },
  { name: "semibold · 600", cls: "font-semibold" },
  { name: "bold · 700", cls: "font-bold" },
  { name: "black · 900", cls: "font-black" },
];

// The corners: one name per job (`--radius-*` in globals.css).
const RADIUS_SCALE = [
  { name: "tag", px: 6, cls: "rounded-tag", job: "ป้ายเล็ก (SL/TP, LIMIT), ปุ่มเล็กในแถบ, ช่องกรอกเล็กในตาราง, กล่องติ๊ก" },
  { name: "control", px: 8, cls: "rounded-control", job: "ปุ่มบนหัวหน้า, ตัวเลือก (select), เลขหน้า, ตัวเลือกเลื่อน" },
  { name: "box", px: 12, cls: "rounded-box", job: "ปุ่มใหญ่ (Save, Cancel), แท็บ, ช่องกรอก, กล่องในการ์ด" },
  { name: "card", px: 20, cls: "rounded-card", job: "การ์ดบนหน้า, กล่องใหญ่ในป๊อปอัป" },
  { name: "popup", px: 24, cls: "rounded-popup", job: "ป๊อปอัป, เมนูข้าง" },
  { name: "full", px: 0, cls: "rounded-full", job: "วงกลม, แถบความคืบหน้า, ป้ายมนสุด" },
];

// The shadows: two soft names (`--shadow-*` in globals.css).
const SHADOW_SCALE = [
  { name: "card", cls: "shadow-card", job: "วางอยู่บนพื้น: การ์ด, ปุ่มและช่องกรอกบนหน้า, เม็ดสีขาวในตัวเลือกเลื่อน" },
  { name: "raised", cls: "shadow-raised", job: "ลอยขึ้นมา: แท็บที่เลือก, เมนูที่เปิดลง, กล่องข้อมูลบนกราฟ, ป๊อปอัป" },
];

const SPACES = [
  { cls: "w-1", label: "1 · 4px" },
  { cls: "w-1.5", label: "1.5 · 6px" },
  { cls: "w-2", label: "2 · 8px" },
  { cls: "w-2.5", label: "2.5 · 10px" },
  { cls: "w-3", label: "3 · 12px" },
  { cls: "w-4", label: "4 · 16px" },
  { cls: "w-5", label: "5 · 20px" },
  { cls: "w-6", label: "6 · 24px" },
  { cls: "w-8", label: "8 · 32px" },
];

type Section = "colours" | "type" | "shape" | "pieces";
const SECTIONS = [
  { id: "colours", label: "Colours", icon: Palette },
  { id: "type", label: "Type", icon: Type },
  { id: "shape", label: "Shape", icon: Square },
  { id: "pieces", label: "Pieces", icon: Boxes },
] as const;

// One section of this page: a title, a line about it, then the samples.
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={cardClass()}>
      <h3 className="text-title font-black text-ink mb-1">{title}</h3>
      {note && <p className="text-body text-ink-muted mb-5">{note}</p>}
      {children}
    </section>
  );
}

export default function DesignPage() {
  const [section, setSection] = useState<Section>("colours");
  const [range, setRange] = useState<"1W" | "1M" | "3M" | "ALL">("1M");
  const [tab, setTab] = useState<"a" | "b">("a");
  const [savedValue, setSavedValue] = useState("1.00");
  const [value, setValue] = useState("1.00");
  const [isSaving, setIsSaving] = useState(false);

  const fakeSave = () => {
    setIsSaving(true);
    setTimeout(() => { setSavedValue(value); setIsSaving(false); }, 600);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Design System" shortTitle="Design" />

      <p className="text-body text-ink-muted -mt-2">
        รวมทุกอย่างที่ใช้แต่งหน้าตาแอป สีและชิ้นส่วนบนหน้านี้คือของจริงจากแอป ถ้าแก้ในแอปก็จะเปลี่ยนตามที่นี่ด้วย
        กฎการใช้ทั้งหมดอยู่ใน AGENTS.md
      </p>

      <PillTabs tabs={SECTIONS} value={section} onChange={setSection} />

      {section === "colours" && (
        <Section title="สี" note="ตั้งชื่อตามหน้าที่ ใช้ได้แค่ชุดนี้ เขียนในโค้ดเป็น text-accent, bg-card, border-line ... · รหัสสี (hex) ใช้กับงานนอกแอป เช่น โลโก้ หรือรูปวาด">
          <div className="space-y-6">
            {COLOURS.map(g => (
              <div key={g.group}>
                <p className={`${LABEL} mb-2`}>{g.group}</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {g.items.map(c => (
                    <div key={c.name} className="rounded-box border border-line overflow-hidden">
                      <div className={`h-10 md:h-14 ${c.swatch} border-b border-line`} />
                      <div className="p-3">
                        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between md:gap-2">
                          <span className="text-body font-bold text-ink">{c.name}</span>
                          <span className="text-caption font-semibold text-ink-faint tabular-nums select-all">{c.hex}</span>
                        </div>
                        <p className="text-small text-ink-muted mt-0.5">{c.job}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {section === "type" && (
        <>
          <Section title="ฟอนต์" note="Plus Jakarta Sans สำหรับอังกฤษและตัวเลข, Anuphan สำหรับภาษาไทย (ตั้งไว้ที่เดียวใน layout.tsx)">
            <p className="text-figure font-bold text-ink">Profit $1,234.56 · กำไรวันนี้</p>
          </Section>

          <Section title="ขนาดตัวอักษร" note="7 ชื่อตามหน้าที่ ชื่อกำหนดแค่ขนาด น้ำหนักและระยะตัวอักษรเขียนคู่ไว้ตามตัวอย่าง">
            <div className="divide-y divide-line-soft">
              {TYPE_SCALE.map(t => (
                <div key={t.name} className="py-4 first:pt-0 grid grid-cols-1 md:grid-cols-[9rem_1fr_16rem] gap-2 md:gap-4 md:items-center">
                  <div>
                    <p className="text-body font-bold text-ink">{t.name}</p>
                    <p className="text-small text-ink-faint">{t.px}px</p>
                  </div>
                  <div className="min-w-0">
                    <p className={`truncate text-ink ${t.sample}`}>{t.text}</p>
                    <p className="text-small text-ink-muted mt-1">{t.job}</p>
                  </div>
                  <code className="text-caption font-semibold text-ink-muted bg-surface-2 rounded-tag px-2 py-1 w-fit">{t.sample}</code>
                </div>
              ))}
            </div>
          </Section>

          <Section title="น้ำหนัก" note="ใช้ได้ 4 แบบ เขียนคู่กับชื่อขนาดเสมอ">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {WEIGHT_SCALE.map(w => (
                <div key={w.name} className="rounded-box bg-surface p-4">
                  <p className={`text-figure text-ink ${w.cls}`}>Aa กข</p>
                  <p className="text-small font-bold text-ink mt-2">{w.name}</p>
                  <p className="text-caption text-ink-faint">{w.cls}</p>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {section === "shape" && (
        <>
          <Section title="มุมมน" note="5 ชื่อตามหน้าที่ + full (วงกลม) · ยิ่งชิ้นใหญ่ มุมยิ่งมน · ข้อยกเว้นเดียว: ปุ่มในเมนูข้าง 16px">
            <div className="divide-y divide-line-soft">
              {RADIUS_SCALE.map(r => (
                <div key={r.name} className="py-4 first:pt-0 grid grid-cols-[4.5rem_1fr] md:grid-cols-[9rem_6rem_1fr] gap-x-4 gap-y-2 items-center">
                  <div>
                    <p className="text-body font-bold text-ink">{r.name}</p>
                    <p className="text-small text-ink-faint">{r.px ? `${r.px}px` : "วงกลม"}</p>
                  </div>
                  <div className={`h-12 w-20 bg-accent-soft border border-accent-line ${r.cls}`} />
                  <p className="text-small text-ink-muted col-span-2 md:col-span-1">{r.job}</p>
                </div>
              ))}
            </div>

            <p className={`${LABEL} mt-6 mb-3`}>ตัวอย่างวางซ้อนกัน</p>
            <div className="rounded-popup bg-surface p-4 md:p-5">
              <div className="rounded-card bg-card border border-line p-4 md:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-title font-black text-ink">Card · 20px</p>
                  <div className="flex bg-surface-2 p-0.5 rounded-control">
                    <span className="h-7 px-3 flex items-center rounded-tag bg-card shadow-card text-caption font-bold text-ink">1M</span>
                    <span className="h-7 px-3 flex items-center rounded-tag text-caption font-bold text-ink-faint">ALL</span>
                  </div>
                </div>
                <div className="rounded-box bg-surface p-4 flex flex-wrap items-center gap-3">
                  <span className="text-small font-bold text-ink-muted">Box · 12px</span>
                  <span className="px-2 py-0.5 rounded-tag border border-loss-line bg-loss-soft text-label font-black uppercase text-loss">SL</span>
                  <span className="px-2 py-0.5 rounded-tag border border-accent-line bg-accent-soft text-label font-black uppercase text-accent">TP</span>
                  <span className="text-caption text-ink-faint">← tag · 6px</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="h-9 px-4 flex items-center rounded-control border border-line bg-card text-small font-bold text-ink-muted">Control · 8px</span>
                  <span className="px-5 py-2.5 rounded-box bg-accent text-white text-body font-bold">Box · 12px</span>
                </div>
              </div>
              <p className="text-caption text-ink-faint mt-3">พื้นนอกสุด = popup 24px</p>
            </div>
          </Section>

          <Section title="เงา" note="2 ชื่อ เงานุ่มทั้งคู่ · ปุ่มส้มไม่มีเงาส้ม">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-surface rounded-box p-5">
              {SHADOW_SCALE.map(s => (
                <div key={s.name} className="space-y-3">
                  <div className={`h-20 bg-card rounded-box ${s.cls}`} />
                  <div>
                    <p className="text-body font-bold text-ink">{s.name}</p>
                    <p className="text-small text-ink-muted mt-0.5">{s.job}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-small text-ink-muted">
              <span className="font-bold text-ink">เอฟเฟกต์ที่ไม่นับเป็นเงา:</span> แสงเรืองรอบมาตรวัด Drawdown กับเปลวไฟ, เงาส้มอ่อนใต้การ์ดสีส้ม, เส้นใต้หัวตารางใน Import, พื้นเทาใน Performance, ร่องในมาตรวัด, เงาของไอคอนสภาพอากาศ
            </p>
          </Section>

          <Section title="ระยะห่าง" note="ค่าที่ใช้บ่อย (หน่วยของ Tailwind, 1 = 4px)">
            <div className="space-y-2">
              {SPACES.map(s => (
                <div key={s.cls} className="flex items-center gap-4">
                  <span className="w-24 shrink-0 text-small font-bold text-ink-muted">{s.label}</span>
                  <div className={`h-4 rounded-tag bg-accent ${s.cls}`} />
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {section === "pieces" && (
        <>
          <Section title="หัวหน้า · PageHeader + HeaderButton" note="ทุกหน้าเริ่มด้วยแถวนี้ สูง 36px เสมอ บนมือถือปุ่มเหลือแค่ไอคอน">
            <div className="rounded-box bg-surface p-4">
              <PageHeader title="Page Title" shortTitle="Title">
                <HeaderButton icon={Upload} label="Primary" variant="primary" />
                <HeaderButton icon={Download} label="Secondary" variant="secondary" />
                <HeaderButton icon={Settings2} label="Outline" variant="outline" />
                <HeaderButton icon={Plus} label="Plain" variant="plain" iconOnly />
              </PageHeader>
            </div>
          </Section>

          <Section title="การ์ด · Card + CardTitle" note="ขอบใน normal (มือถือ 20px, คอม 24px) / compact (16px) / none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface rounded-box p-4">
              <SiteCard>
                <CardTitle className="mb-4">Statistics</CardTitle>
                <p className="text-body text-ink-muted">การ์ดปกติ</p>
              </SiteCard>
              <div className="grid grid-cols-2 gap-4">
                <SiteCard padding="compact">
                  <p className={LABEL}>Win rate</p>
                  <p className="text-figure font-black text-ink tracking-tight mt-1">62.5%</p>
                </SiteCard>
                <SiteCard padding="compact">
                  <p className={LABEL}>Trades</p>
                  <p className="text-figure font-black text-ink tracking-tight mt-1">241</p>
                </SiteCard>
              </div>
            </div>
          </Section>

          <Section title="ปุ่ม · Button + IconButton" note="5 แบบ × 2 ขนาด · md ในการ์ดและป๊อปอัป, sm ในแถบตัวกรองหรือแถวตาราง">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" icon={Save}>Save</Button>
                <Button variant="secondary">Cancel</Button>
                <Button variant="outline" icon={Download}>Export</Button>
                <Button variant="danger" icon={Trash2}>Delete</Button>
                <Button variant="plain" icon={Plus}>Add</Button>
                <Button variant="primary" disabled>Disabled</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm">Apply</Button>
                <Button variant="secondary" size="sm">Reset</Button>
                <Button variant="outline" size="sm">Outline</Button>
                <Button variant="danger" size="sm">Clear</Button>
                <Button variant="plain" size="sm" icon={Plus}>Add</Button>
                <span className="mx-1 h-5 w-px bg-line" />
                <IconButton icon={Pencil} label="Edit" />
                <IconButton icon={Trash2} label="Delete" />
                <IconButton icon={X} label="Close" />
                <IconButton icon={ChevronRight} label="Next" size="sm" />
              </div>
              <p className="text-small text-ink-faint">primary = ทำสิ่งหลัก (Save, Import, Start) · secondary = ปุ่มรอง (Cancel, Close) · outline = ปุ่มเบาสีส้ม · danger = ลบหรือล้าง · plain = ปุ่มเสริมบนการ์ดขาว</p>
            </div>
          </Section>

          <Section title="ปุ่ม Save · SaveRow" note="ลองแก้ตัวเลขในช่อง ปุ่ม Save จะเลื่อนออกมา (ไม่ได้บันทึกอะไรจริง)">
            <div className="w-40">
              <FieldLabel label="Risk %">
                <Input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" />
              </FieldLabel>
            </div>
            <SaveRow
              isDirty={value !== savedValue}
              canSave={value.trim() !== "" && !isNaN(Number(value))}
              isSaving={isSaving}
              onSave={fakeSave}
              onCancel={() => setValue(savedValue)}
            />
          </Section>

          <Section title="ช่องกรอก · Input, Select, Textarea" note="md ในฟอร์ม, sm ในแถบตัวกรอง">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldLabel label="Risk %" note="ตัวเลขเท่านั้น">
                <Input defaultValue="1.00" inputMode="decimal" />
              </FieldLabel>
              <FieldLabel label="Trading day starts">
                <Select defaultValue="5">
                  <option value="5">05:00</option>
                  <option value="6">06:00</option>
                </Select>
              </FieldLabel>
              <div className="md:col-span-2">
                <FieldLabel label="Notes">
                  <Textarea rows={2} placeholder="Add your notes here..." />
                </FieldLabel>
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-2 rounded-box bg-surface p-3">
                <span className="text-small font-bold text-ink-muted">sm:</span>
                <Select size="sm" defaultValue="nov"><option value="nov">November 2026</option></Select>
                <Input size="sm" placeholder="Search" className="w-40" />
              </div>
            </div>
          </Section>

          <Section title="แท็บ · PillTabs" note="ใช้ใน Settings และ Add Entry · onWhite เมื่ออยู่บนการ์ดขาว">
            <PillTabs
              onWhite
              tabs={[{ id: "a", label: "General", icon: Settings2 }, { id: "b", label: "Import", icon: Upload }]}
              value={tab}
              onChange={setTab}
            />
          </Section>

          <Section title="ตัวเลือกเลื่อน · SlidingSwitch" note="ใช้เลือกช่วงกราฟ, ตัววัด, ช่วงโน้ต">
            <SlidingSwitch
              label="Range"
              options={[{ value: "1W", label: "1W" }, { value: "1M", label: "1M" }, { value: "3M", label: "3M" }, { value: "ALL", label: "ALL" }]}
              value={range}
              onChange={setRange}
            />
          </Section>

          <Section title="ที่ยังเขียนเองอยู่ (ตั้งใจ)">
            <ul className="text-body text-ink-muted space-y-1.5 list-disc pl-5">
              <li>ช่องในปฏิทิน, ไอคอนแก้ไข/ลบในแถวตาราง, แถบแก้หลายเทรดใน History, ชิปตัวกรอง, เลขหน้า, เมนูข้าง, แป้นใส่ PIN</li>
              <li>ตัวเลือกตัวกรองใน History และ Performance ที่กว้างเต็มจอบนมือถือ, ช่องค้นหาใน Notes (มีไอคอนข้างใน)</li>
              <li>ช่องใน Add Entry ใช้แบบ md แต่ขอบข้าง 12px (ไม่ใช่ 16px) เพื่อให้ XAUUSD และ SELL พอดีช่องบนมือถือ</li>
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
