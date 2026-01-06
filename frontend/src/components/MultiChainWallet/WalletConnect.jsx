import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, LogOut, Copy, ExternalLink, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWalletStore } from '../../store/walletStore'

const WalletConnector = () => {
    const {
        connected,
        walletAddress,
        network,
        balance,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        availableNetworks
    } = useWalletStore()

    const [showNetworks, setShowNetworks] = useState(false)

    const handleConnect = async () => {
        try {
            await connectWallet('near') // По умолчанию NEAR
            toast.success('Кошелек подключен!')
        } catch (error) {
            toast.error('Ошибка подключения кошелька')
            console.error(error)
        }
    }

    const handleDisconnect = () => {
        disconnectWallet()
        toast.success('Кошелек отключен')
    }

    const handleCopyAddress = () => {
        navigator.clipboard.writeText(walletAddress)
        toast.success('Адрес скопирован в буфер')
    }

    const formatAddress = (address) => {
        if (!address) return ''
        return `${address.slice(0, 6)}...${address.slice(-4)}`
    }

    return (
        <div className="fixed top-4 right-4 z-50">
            <AnimatePresence>
                {!connected ? (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        onClick={handleConnect}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 
                     text-white font-bold rounded-full shadow-lg hover:shadow-xl 
                     transform hover:-translate-y-1 transition-all duration-300"
                    >
                        <Wallet className="w-5 h-5" />
                        <span>Подключить кошелек</span>
                    </motion.button>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="relative"
                    >
                        <div className="flex items-center gap-4 p-3 bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-700">
                            {/* Информация о сети */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowNetworks(!showNetworks)}
                                    className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
                                >
                                    <img
                                        src={`/static/images/chain-logos/${network}.png`}
                                        alt={network}
                                        className="w-6 h-6 rounded-full"
                                        onError={(e) => e.target.src = '/static/images/chain-logos/default.png'}
                                    />
                                    <span className="font-bold text-sm">{network.toUpperCase()}</span>
                                    <ChevronDown className="w-4 h-4" />
                                </button>

                                {/* Выбор сети */}
                                <AnimatePresence>
                                    {showNetworks && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="absolute top-full left-0 mt-2 w-48 bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden z-50"
                                        >
                                            {availableNetworks.map((net) => (
                                                <button
                                                    key={net}
                                                    onClick={() => {
                                                        switchNetwork(net)
                                                        setShowNetworks(false)
                                                        toast.success(`Переключено на ${net.toUpperCase()}`)
                                                    }}
                                                    className={`flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-800 transition-colors
                                    ${network === net ? 'bg-gray-800' : ''}`}
                                                >
                                                    <img
                                                        src={`/static/images/chain-logos/${net}.png`}
                                                        alt={net}
                                                        className="w-5 h-5 rounded-full"
                                                    />
                                                    <span className="font-medium">{net.toUpperCase()}</span>
                                                    {network === net && (
                                                        <div className="ml-auto w-2 h-2 bg-green-400 rounded-full"></div>
                                                    )}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Баланс */}
                            <div className="px-3 py-2 bg-gray-900 rounded-lg">
                                <span className="font-bold">
                                    {balance.toFixed(4)} {network === 'near' ? 'Ⓝ' : network === 'ethereum' ? 'Ξ' : '◎'}
                                </span>
                            </div>

                            {/* Адрес кошелька */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopyAddress}
                                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-700 to-blue-800 
                           rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all"
                                    title="Скопировать адрес"
                                >
                                    <Copy className="w-4 h-4" />
                                    <span className="font-mono text-sm">{formatAddress(walletAddress)}</span>
                                </button>

                                <a
                                    href={`https://explorer.${network}.org/accounts/${walletAddress}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
                                    title="Открыть в эксплорере"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>

                                <button
                                    onClick={handleDisconnect}
                                    className="p-2 bg-red-900/30 rounded-lg hover:bg-red-800/50 transition-colors"
                                    title="Отключить кошелек"
                                >
                                    <LogOut className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default WalletConnector