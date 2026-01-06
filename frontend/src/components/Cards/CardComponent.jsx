import React from 'react'
import { motion } from 'framer-motion'
import { Sword, Shield, Flame, Droplets, Mountain, Wind, Sun, Moon } from 'lucide-react'

const CardComponent = ({ card, onClick, selected = false, disabled = false }) => {
    const elementIcons = {
        fire: <Flame className="w-4 h-4" />,
        water: <Droplets className="w-4 h-4" />,
        earth: <Mountain className="w-4 h-4" />,
        wind: <Wind className="w-4 h-4" />,
        light: <Sun className="w-4 h-4" />,
        dark: <Moon className="w-4 h-4" />
    }

    const rarityColors = {
        common: 'border-gray-400',
        rare: 'border-blue-400',
        epic: 'border-purple-400',
        legendary: 'border-yellow-400',
        mythic: 'border-red-400'
    }

    return (
        <motion.div
            whileHover={{ y: -10, rotateY: 5 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={`
        relative w-48 h-64 rounded-xl cursor-pointer transform transition-all duration-300
        ${selected ? 'ring-4 ring-blue-400 scale-105' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${rarityColors[card.rarity] || 'border-gray-600'}
        border-4 bg-gradient-to-br from-gray-800 to-gray-900
        shadow-2xl overflow-hidden
      `}
        >
            {/* Элемент карты */}
            <div className="absolute top-3 right-3">
                <div className="p-2 rounded-full bg-gray-900/80">
                    {elementIcons[card.element] || <Sword className="w-4 h-4" />}
                </div>
            </div>

            {/* Сеть карты */}
            <div className="absolute top-3 left-3">
                <span className="px-2 py-1 text-xs font-bold bg-gray-900/80 rounded">
                    {card.network.toUpperCase()}
                </span>
            </div>

            {/* Название карты */}
            <div className="absolute top-12 left-0 right-0 text-center">
                <h3 className="text-xl font-bold text-white drop-shadow-lg">{card.name}</h3>
                <p className="text-xs text-gray-300">{card.collection}</p>
            </div>

            {/* Значения карты */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-32 h-32">
                    {/* Верх */}
                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                        <div className="w-12 h-12 bg-gray-900 border-2 border-blue-400 rounded-full flex items-center justify-center">
                            <span className="text-xl font-bold text-white">{card.top}</span>
                        </div>
                    </div>

                    {/* Право */}
                    <div className="absolute top-1/2 -right-6 transform -translate-y-1/2">
                        <div className="w-12 h-12 bg-gray-900 border-2 border-green-400 rounded-full flex items-center justify-center">
                            <span className="text-xl font-bold text-white">{card.right}</span>
                        </div>
                    </div>

                    {/* Низ */}
                    <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2">
                        <div className="w-12 h-12 bg-gray-900 border-2 border-red-400 rounded-full flex items-center justify-center">
                            <span className="text-xl font-bold text-white">{card.bottom}</span>
                        </div>
                    </div>

                    {/* Лево */}
                    <div className="absolute top-1/2 -left-6 transform -translate-y-1/2">
                        <div className="w-12 h-12 bg-gray-900 border-2 border-yellow-400 rounded-full flex items-center justify-center">
                            <span className="text-xl font-bold text-white">{card.left}</span>
                        </div>
                    </div>

                    {/* Центр */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 bg-gray-900/80 rounded-full flex items-center justify-center">
                            <Sword className="w-8 h-8 text-gray-300" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Редкость */}
            <div className="absolute bottom-3 left-3">
                <span className="px-2 py-1 text-xs font-bold text-white bg-gray-900/80 rounded">
                    {card.rarity.toUpperCase()}
                </span>
            </div>

            {/* Общая сила */}
            <div className="absolute bottom-3 right-3">
                <div className="flex items-center gap-1 px-2 py-1 bg-gray-900/80 rounded">
                    <Sword className="w-3 h-3" />
                    <span className="text-sm font-bold">
                        {card.top + card.right + card.bottom + card.left}
                    </span>
                </div>
            </div>

            {/* Анимация выбора */}
            {selected && (
                <motion.div
                    className="absolute inset-0 border-4 border-blue-400 rounded-xl pointer-events-none"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                />
            )}
        </motion.div>
    )
}

export default CardComponent