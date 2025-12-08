export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Politique de Confidentialité</h1>
        
        <div className="prose prose-lg max-w-none space-y-6">
          <section>
            <p className="text-muted-foreground mb-4">
              <strong>Dernière mise à jour :</strong> {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Introduction</h2>
            <p>
              La présente Politique de Confidentialité décrit la façon dont nous collectons, 
              utilisons, stockons et protégeons vos informations personnelles lorsque vous 
              utilisez notre plateforme de gestion d'événements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. Données Collectées</h2>
            <h3 className="text-xl font-semibold mt-6 mb-3">2.1 Informations que vous nous fournissez</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Données d'authentification :</strong> Adresse email, nom d'utilisateur, mot de passe (haché)</li>
              <li><strong>Profil utilisateur :</strong> Nom, prénom, informations de contact</li>
              <li><strong>Données d'événements :</strong> Titre, description, dates, lieu, images</li>
              <li><strong>Données d'organisateurs :</strong> Informations sur les organisateurs et lieux d'événements</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-3">2.2 Informations collectées automatiquement</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Adresse IP</li>
              <li>Type de navigateur et version</li>
              <li>Pages visitées et durée de visite</li>
              <li>Date et heure d'accès</li>
              <li>Données de localisation (si autorisées)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. Utilisation des Données</h2>
            <p>Nous utilisons vos données personnelles pour :</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Fournir et améliorer nos services</li>
              <li>Gérer votre compte et vos préférences</li>
              <li>Traiter et afficher les demandes de création d'événements</li>
              <li>Vous contacter concernant votre compte ou nos services</li>
              <li>Respecter nos obligations légales</li>
              <li>Prévenir la fraude et assurer la sécurité</li>
              <li>Analyser l'utilisation de la plateforme pour améliorer l'expérience utilisateur</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Partage des Données</h2>
            <p>Nous ne vendons pas vos données personnelles. Nous pouvons partager vos informations uniquement dans les cas suivants :</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Fournisseurs de services :</strong> Avec des prestataires techniques (hébergement, bases de données) qui nous aident à faire fonctionner la plateforme</li>
              <li><strong>Obligations légales :</strong> Lorsque la loi l'exige ou pour répondre à des demandes judiciaires</li>
              <li><strong>Protection des droits :</strong> Pour protéger nos droits, votre sécurité ou celle d'autrui</li>
              <li><strong>Intégrations tierces :</strong> Avec des services comme Facebook (via l'API Graph) pour l'importation d'événements, uniquement avec votre consentement</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Stockage et Sécurité</h2>
            <h3 className="text-xl font-semibold mt-6 mb-3">5.1 Sécurité</h3>
            <p>
              Nous mettons en œuvre des mesures de sécurité techniques et organisationnelles 
              appropriées pour protéger vos données contre l'accès non autorisé, la perte, 
              la destruction ou l'altération :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Chiffrement des mots de passe</li>
              <li>Connexions sécurisées (HTTPS)</li>
              <li>Authentification sécurisée</li>
              <li>Accès restreint aux données personnelles</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-3">5.2 Durée de conservation</h3>
            <p>
              Nous conservons vos données personnelles aussi longtemps que nécessaire pour 
              fournir nos services et respecter nos obligations légales. Les données de 
              compte sont conservées jusqu'à la suppression du compte par l'utilisateur ou 
              par nous-mêmes en cas d'inactivité prolongée.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Vos Droits</h2>
            <p>Conformément au RGPD et à la législation applicable, vous disposez des droits suivants :</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Droit d'accès :</strong> Vous pouvez demander une copie de vos données personnelles</li>
              <li><strong>Droit de rectification :</strong> Vous pouvez corriger vos données inexactes</li>
              <li><strong>Droit à l'effacement :</strong> Vous pouvez demander la suppression de vos données</li>
              <li><strong>Droit à la limitation :</strong> Vous pouvez demander la limitation du traitement</li>
              <li><strong>Droit à la portabilité :</strong> Vous pouvez récupérer vos données dans un format structuré</li>
              <li><strong>Droit d'opposition :</strong> Vous pouvez vous opposer au traitement de vos données</li>
              <li><strong>Droit de retirer votre consentement :</strong> À tout moment, pour les traitements basés sur le consentement</li>
            </ul>
            <p className="mt-4">
              Pour exercer ces droits, contactez-nous à l'adresse indiquée dans la section "Contact".
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">7. Cookies et Technologies Similaires</h2>
            <p>
              Nous utilisons des cookies et technologies similaires pour améliorer votre expérience, 
              analyser l'utilisation de la plateforme et personnaliser le contenu. Vous pouvez 
              gérer vos préférences de cookies via les paramètres de votre navigateur.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">8. Intégrations Tierces</h2>
            <h3 className="text-xl font-semibold mt-6 mb-3">8.1 Facebook</h3>
            <p>
              Lorsque vous utilisez la fonctionnalité d'importation d'événements depuis Facebook, 
              nous accédons uniquement aux données publiques des pages Facebook via l'API Graph. 
              Nous ne stockons que les informations nécessaires pour afficher les événements sur 
              notre plateforme. Pour plus d'informations, consultez la 
              <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {" "}Politique de Confidentialité de Facebook
              </a>.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">8.2 Supabase</h3>
            <p>
              Nous utilisons Supabase pour l'hébergement et la gestion de la base de données. 
              Vos données sont stockées de manière sécurisée via leurs services. Pour plus 
              d'informations, consultez la 
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {" "}Politique de Confidentialité de Supabase
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">9. Modifications de cette Politique</h2>
            <p>
              Nous pouvons modifier cette Politique de Confidentialité de temps à autre. 
              Toute modification sera publiée sur cette page avec une mise à jour de la 
              date de "Dernière mise à jour". Nous vous encourageons à consulter régulièrement 
              cette page pour rester informé de nos pratiques.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">10. Contact</h2>
            <p>
              Pour toute question concernant cette Politique de Confidentialité ou pour exercer 
              vos droits, veuillez nous contacter à :
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p><strong>Email :</strong> lazbutton@gmail.com</p>
              <p className="mt-2"><strong>Adresse : </strong> 1 Av. du Champ de Mars, 45100 Orléans</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">11. Autorité de Contrôle</h2>
            <p>
              Si vous estimez que le traitement de vos données personnelles constitue une 
              violation du RGPD, vous avez le droit d'introduire une réclamation auprès de 
              l'autorité de contrôle compétente. En France, il s'agit de la 
              <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {" "}Commission Nationale de l'Informatique et des Libertés (CNIL)
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

