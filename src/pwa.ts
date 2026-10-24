/// <reference types="vite/client" />
export async function preparePwa(): Promise<void> {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator))
        return;
    let starting = true;
    let reloadApproved = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadApproved)
            location.reload();
    });
    const task = (async () => {
        const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        const offerUpdate = () => {
            if (!registration.waiting || !navigator.serviceWorker.controller)
                return;
            if (starting) {
                reloadApproved = true;
                registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
                return;
            }
            if (document.getElementById("pwa-update"))
                return;
            const button = document.createElement("button");
            button.id = "pwa-update";
            button.textContent = "新しいバージョンがあります・更新";
            button.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:100;padding:10px 16px;background:#222;color:white;border:1px solid #aaa;border-radius:8px;touch-action:manipulation";
            button.onclick = () => {
                if (!confirm("更新すると今のプレイは終了します。更新しますか？"))
                    return;
                reloadApproved = true;
                registration.waiting?.postMessage({ type: "ACTIVATE_UPDATE" });
            };
            document.body.append(button);
        };
        registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
                if (worker.state === "installed")
                    offerUpdate();
            });
        });
        offerUpdate();
        await registration.update();
        const worker = registration.installing;
        if (worker)
            await new Promise<void>((resolve) => {
                worker.addEventListener("statechange", () => {
                    if (worker.state === "installed" || worker.state === "redundant")
                        resolve();
                });
                if (worker.state === "installed" || worker.state === "redundant")
                    resolve();
            });
        offerUpdate();
        const check = () => {
            if (document.visibilityState === "visible")
                void registration.update().catch(() => { });
        };
        document.addEventListener("visibilitychange", check);
        setInterval(check, 60000);
    })().catch((error) => console.warn("ChunBall update check unavailable", error));
    await Promise.race([task, new Promise<void>((resolve) => setTimeout(resolve, 4000))]);
    starting = false;
    if (reloadApproved)
        await new Promise<void>(() => { });
}
