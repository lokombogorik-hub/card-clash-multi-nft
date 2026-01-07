import React, { useState } from "react";

export default function Game({ onExit }) {
    const [flipped, setFlipped] = useState(false);

    return (
        <div className="game">
            <button className="exit" onClick={onExit}>⟵ Меню</button>

            <div
                className={`card ${flipped ? "flipped" : ""}`}
                onClick={() => setFlipped(!flipped)}
            >
                <div className="card-inner">
                    <div className="card-front">?</div>
                    <div className="card-back">🟥 5</div>
                </div>
            </div>
        </div>
    );
}
