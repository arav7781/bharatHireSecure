
import { motion, useInView } from "framer-motion";
import { useRef } from "react";


export function FeatureCard({ icon, title, description, color, delay }: { icon: React.ReactNode; title: string; description: string; color: string; delay: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50, rotateX: -15 }}
      animate={isInView ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: -15 }}
      transition={{ duration: 0.6, delay, type: "spring", stiffness: 100 }}
      whileHover={{
        scale: 1.05,
        rotateY: 5,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      }}
      className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 hover:shadow-2xl transition-all duration-300 group cursor-pointer"
    >
      <motion.div
        whileHover={{ rotate: 360, scale: 1.1 }}
        transition={{ duration: 0.6 }}
        className={`w-14 h-14 bg-gradient-to-r ${color} rounded-xl flex items-center justify-center text-white mb-4 group-hover:shadow-lg`}
      >
        {icon}
      </motion.div>
      <motion.h3
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ delay: delay + 0.2 }}
        className="font-bold text-gray-800 mb-2 text-lg"
      >
        {title}
      </motion.h3>
      <motion.p
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ delay: delay + 0.3 }}
        className="text-sm text-gray-600 leading-relaxed"
      >
        {description}
      </motion.p>
    </motion.div>
  );
}