import React, { useState } from "react";
import "./index.css";

const cards = [1, 2, 3, 4, 5];

export default function Game({ onExit }) {
    const [selectedCard, setSelectedCard] = useState(null);

    return (
        <div className="screen">
            {/* ВРАГ */}
            <div className="hand top">
                {cards.map((c, i) => (
                    <div
                        key={c}
                        className="card enemy"
                        style={{ marginLeft: i === 0 ? 0 : -24 }}
                    >
                        {c}
                    </div>
                ))}
            </div>

            {/* ПОЛЕ */}
            <div className="board">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div
                        key={i}
                        className={`cell ${selectedCard !== null ? "cell-active" : ""
                            }`}
                    />
                ))}
            </div>

            {/* ИГРОК */}
            <div className="hand bottom">
                {cards.map((c, i) => (
                    <div
                        key={c}
                        className={`card player ${selectedCard === c ? "selected" : ""
                            }`}
                        style={{ marginLeft: i === 0 ? 0 : -24 }}
                        onClick={() =>
                            setSelectedCard(selectedCard === c ? null : c)
                        }
                    >
                        {c}
                    </div>
                ))}
            </div>

            <button className="exit" onClick={onExit}>
                ⟵ Меню
            </button>
        </div>
    );
}
