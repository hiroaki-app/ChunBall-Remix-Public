import { clearSlot, captureSaveGame, formatSavedAt, listSlots, loadSaveGame, parseSaveGame, readSlot, stageLabel, writeSlot, type SaveGame, type SlotInfo } from "./save";
import type { World } from "./model";
export type SaveUiCallbacks = {
    getWorld: () => World;
    setWorld: (world: World) => void;
    onOpenChange: (open: boolean) => void;
};
type ConfirmKind = "overwrite" | "delete" | null;
export function createSaveUi(cb: SaveUiCallbacks): {
    open: () => void;
    close: () => void;
    isOpen: () => boolean;
} {
    let open = false;
    let confirm: ConfirmKind = null;
    let confirmSlot = -1;
    let statusMsg = "";
    const root = document.createElement("div");
    root.id = "save-ui";
    root.className = "save-ui hidden";
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);
    function setOpen(next: boolean): void {
        open = next;
        root.classList.toggle("hidden", !next);
        root.setAttribute("aria-hidden", next ? "false" : "true");
        cb.onOpenChange(next);
        if (next) {
            confirm = null;
            statusMsg = "";
            render();
        }
    }
    function render(): void {
        const slots = listSlots();
        root.innerHTML = "";
        const panel = document.createElement("div");
        panel.className = "save-panel";
        const title = document.createElement("h1");
        title.className = "save-title";
        title.textContent = "💾 セーブ";
        panel.appendChild(title);
        if (statusMsg) {
            const status = document.createElement("p");
            status.className = "save-status";
            status.textContent = statusMsg;
            panel.appendChild(status);
        }
        for (const slot of slots) {
            panel.appendChild(renderSlot(slot));
        }
        const back = document.createElement("button");
        back.type = "button";
        back.className = "save-btn save-btn-back";
        back.textContent = "戻る";
        back.addEventListener("click", () => setOpen(false));
        panel.appendChild(back);
        root.appendChild(panel);
        if (confirm) {
            root.appendChild(renderConfirm());
        }
    }
    function renderSlot(slot: SlotInfo): HTMLElement {
        const card = document.createElement("div");
        card.className = "save-slot";
        const head = document.createElement("div");
        head.className = "save-slot-head";
        head.textContent = `Slot ${slot.index + 1}`;
        card.appendChild(head);
        const body = document.createElement("div");
        body.className = "save-slot-body";
        if (slot.corrupt) {
            body.innerHTML = `<p class="save-warn">読み込めないデータ</p>`;
        }
        else if (slot.empty || !slot.save) {
            body.innerHTML = `<p class="save-empty">空き</p>`;
        }
        else {
            const s = slot.save;
            body.innerHTML = `
        <p class="save-stage">${escapeHtml(stageLabel(s.stageId))}ステージ</p>
        <p class="save-time">${escapeHtml(formatSavedAt(s.savedAt))}</p>
        <p class="save-parts">${s.placedParts.length}個の部品</p>
      `;
        }
        card.appendChild(body);
        const actions = document.createElement("div");
        actions.className = "save-actions";
        if (slot.corrupt) {
            actions.appendChild(makeBtn("削除", "save-btn save-btn-danger", () => {
                confirm = "delete";
                confirmSlot = slot.index;
                render();
            }));
            actions.appendChild(makeBtn("上書き保存", "save-btn save-btn-primary", () => {
                confirm = "overwrite";
                confirmSlot = slot.index;
                render();
            }));
        }
        else if (slot.empty || !slot.save) {
            actions.appendChild(makeBtn("💾 保存", "save-btn save-btn-primary", () => {
                doSave(slot.index, false);
            }));
        }
        else {
            actions.appendChild(makeBtn("上書き保存", "save-btn save-btn-primary", () => {
                confirm = "overwrite";
                confirmSlot = slot.index;
                render();
            }));
            const otherStage = false;
            if (!otherStage) {
                actions.appendChild(makeBtn("▶ ロード", "save-btn save-btn-load", () => {
                    doLoad(slot);
                }));
            }
            actions.appendChild(makeBtn("削除", "save-btn save-btn-danger", () => {
                confirm = "delete";
                confirmSlot = slot.index;
                render();
            }));
        }
        card.appendChild(actions);
        return card;
    }
    function renderConfirm(): HTMLElement {
        const overlay = document.createElement("div");
        overlay.className = "save-confirm-overlay";
        const box = document.createElement("div");
        box.className = "save-confirm";
        const msg = document.createElement("p");
        msg.className = "save-confirm-msg";
        msg.textContent =
            confirm === "overwrite"
                ? "このセーブに上書きしますか？"
                : "このセーブを削除しますか？";
        box.appendChild(msg);
        const row = document.createElement("div");
        row.className = "save-confirm-actions";
        row.appendChild(makeBtn("キャンセル", "save-btn", () => {
            confirm = null;
            confirmSlot = -1;
            render();
        }));
        if (confirm === "overwrite") {
            row.appendChild(makeBtn("上書き", "save-btn save-btn-primary", () => {
                const idx = confirmSlot;
                confirm = null;
                confirmSlot = -1;
                doSave(idx, true);
            }));
        }
        else {
            row.appendChild(makeBtn("削除", "save-btn save-btn-danger", () => {
                const idx = confirmSlot;
                confirm = null;
                confirmSlot = -1;
                if (clearSlot(idx)) {
                    statusMsg = `Slot ${idx + 1} を削除しました`;
                }
                else {
                    statusMsg = "削除に失敗しました";
                }
                render();
            }));
        }
        box.appendChild(row);
        overlay.appendChild(box);
        return overlay;
    }
    function doSave(index: number, overwrite: boolean): void {
        const existing = readSlot(index);
        if (!overwrite && !existing.empty && !existing.corrupt) {
            confirm = "overwrite";
            confirmSlot = index;
            render();
            return;
        }
        const save = captureSaveGame(cb.getWorld());
        if (!writeSlot(index, save)) {
            statusMsg = "保存に失敗しました（容量不足など）";
            render();
            return;
        }
        statusMsg = `Slot ${index + 1} に保存しました`;
        render();
    }
    function doLoad(slot: SlotInfo): void {
        let save: SaveGame | null = slot.save;
        if (!save) {
            const again = readSlot(slot.index);
            save = again.save;
            if (again.corrupt || !save) {
                statusMsg = "このセーブは読み込めません";
                render();
                return;
            }
        }
        const ok = parseSaveGame(save);
        if (!ok) {
            statusMsg = "このセーブは読み込めません";
            render();
            return;
        }
        try {
            const world = loadSaveGame(ok);
            cb.setWorld(world);
            statusMsg = `Slot ${slot.index + 1} をロードしました`;
            setOpen(false);
        }
        catch {
            statusMsg = "ロードに失敗しました";
            render();
        }
    }
    function makeBtn(label: string, className: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = className;
        btn.textContent = label;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            onClick();
        });
        return btn;
    }
    root.addEventListener("pointerdown", (e) => e.stopPropagation());
    root.addEventListener("pointerup", (e) => e.stopPropagation());
    root.addEventListener("pointermove", (e) => e.stopPropagation());
    return {
        open: () => setOpen(true),
        close: () => setOpen(false),
        isOpen: () => open,
    };
}
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
