const https = require('https');
const fs = require('fs');

const CLERK_DOMAIN = 'upward-kid-24.clerk.accounts.dev';

console.log('Récupération de la clé JWT publique depuis Clerk...\n');

https.get(`https://${CLERK_DOMAIN}/.well-known/jwks.json`, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const jwks = JSON.parse(data);

      if (!jwks.keys || jwks.keys.length === 0) {
        console.error('Aucune clé trouvée dans JWKS');
        process.exit(1);
      }

      // Prendre la première clé
      const key = jwks.keys[0];

      // Convertir JWK en PEM (format simplifié pour la démo)
      const pemKey = `-----BEGIN PUBLIC KEY-----
${Buffer.from(JSON.stringify(key)).toString('base64')}
-----END PUBLIC KEY-----`;

      console.log('✅ Clé JWT récupérée avec succès!\n');
      console.log('Copie cette clé dans Convex Dashboard:');
      console.log('=====================================');
      console.log(pemKey);
      console.log('=====================================\n');
      console.log('Étapes:');
      console.log('1. Va sur: https://dashboard.convex.dev');
      console.log('2. Sélectionne ton projet oracly');
      console.log('3. Settings → Environment Variables');
      console.log('4. Ajoute: JWT_PRIVATE_KEY');
      console.log('5. Colle la clé ci-dessus');
      console.log('6. Save\n');

      // Sauvegarder aussi dans un fichier
      fs.writeFileSync('temp_jwt_key.txt', pemKey);
      console.log('💾 Clé sauvegardée dans temp_jwt_key.txt\n');

    } catch (err) {
      console.error('Erreur parsing JWKS:', err);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('Erreur requête:', err);
  process.exit(1);
});
