/**
 * Script pour créer un utilisateur admin dans Supabase
 * 
 * Usage:
 *   node scripts/create-admin-user.js admin@example.com "MotDePasse123!"
 * 
 * Ou modifiez les variables ci-dessous directement dans le fichier
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration - À remplir avec vos valeurs
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'VOTRE_SUPABASE_URL';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'VOTRE_SERVICE_ROLE_KEY';

// Informations de l'admin à créer
const adminEmail = process.argv[2] || 'admin@example.com';
const adminPassword = process.argv[3] || 'ChangezCeMotDePasse123!';

async function createAdminUser() {
  if (SUPABASE_URL === 'VOTRE_SUPABASE_URL' || SERVICE_ROLE_KEY === 'VOTRE_SERVICE_ROLE_KEY') {
    console.error('❌ Erreur: Veuillez configurer SUPABASE_URL et SERVICE_ROLE_KEY');
    console.error('   Soit dans un fichier .env.local, soit en modifiant ce script');
    process.exit(1);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    console.log(`📧 Création de l'utilisateur admin: ${adminEmail}...`);

    const { data, error } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true, // Confirmer l'email automatiquement
      app_metadata: {
        role: 'admin'
      }
    });

    if (error) {
      console.error('❌ Erreur lors de la création:', error.message);
      
      // Si l'utilisateur existe déjà, on essaie de le promouvoir
      if (error.message.includes('already registered')) {
        console.log('ℹ️  L\'utilisateur existe déjà, tentative de promotion en admin...');
        
        const { data: { users } } = await adminClient.auth.admin.listUsers();
        const user = users.find(u => u.email === adminEmail);
        
        if (user) {
          const { error: updateError } = await adminClient.auth.admin.updateUserById(
            user.id,
            {
              app_metadata: { role: 'admin' }
            }
          );
          
          if (updateError) {
            console.error('❌ Erreur lors de la promotion:', updateError.message);
            process.exit(1);
          } else {
            console.log('✅ Utilisateur promu admin avec succès!');
            console.log(`   Email: ${adminEmail}`);
            console.log(`   ID: ${user.id}`);
          }
        }
      } else {
        process.exit(1);
      }
    } else {
      console.log('✅ Utilisateur admin créé avec succès!');
      console.log(`   Email: ${data.user.email}`);
      console.log(`   ID: ${data.user.id}`);
      console.log(`   Rôle: ${data.user.app_metadata.role}`);
      console.log('\n🔐 Vous pouvez maintenant vous connecter à:');
      console.log('   http://localhost:3000/admin/login');
    }
  } catch (err) {
    console.error('❌ Erreur inattendue:', err);
    process.exit(1);
  }
}

createAdminUser();







