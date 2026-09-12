import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 é um módulo nativo Node.js (binário .node)
  // Precisa ser excluído do bundle do webpack para rodar no servidor.
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externaliza o módulo nativo para que o Node.js o carregue diretamente
      config.externals = [...(config.externals ?? []), 'better-sqlite3'];
    }
    return config;
  },
};

export default nextConfig;
