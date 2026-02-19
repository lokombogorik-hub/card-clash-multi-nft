import { useEffect, useState } from "react";

export default function useTelegram() {
    const [isTelegram, setIsTelegram] = useState(false);
    const [tgWebApp, setTgWebApp] = useState(null);

    useEffect(() => {
        let isReal = false;
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            isReal =
                !!tg.initDataUnsafe &&
                !!tg.initDataUnsafe.user &&
                typeof tg.initDataUnsafe.user.id !== "undefined";
            setTgWebApp(tg);
        }
        setIsTelegram(isReal);
    }, []);

    return { isTelegram, tgWebApp };
}