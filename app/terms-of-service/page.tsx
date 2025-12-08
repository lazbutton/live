export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Conditions d'Utilisation</h1>
        
        <div className="prose prose-lg max-w-none space-y-6">
          <section>
            <p className="text-muted-foreground mb-4">
              <strong>Dernière mise à jour :</strong> {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <p>
              Veuillez lire attentivement les présentes Conditions d'Utilisation avant d'utiliser 
              la plateforme Live Orléans. En accédant ou en utilisant notre service, vous acceptez 
              d'être lié par ces conditions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acceptation des Conditions</h2>
            <p>
              En accédant et en utilisant la plateforme Live Orléans, vous acceptez d'être lié par 
              ces Conditions d'Utilisation et toutes les lois et réglementations applicables. Si vous 
              n'acceptez pas ces conditions, vous ne devez pas utiliser notre service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. Description du Service</h2>
            <p>
              Live Orléans est une plateforme mobile gratuite qui centralise les événements culturels 
              et de sorties de la ville d'Orléans, France. Notre service permet aux utilisateurs de :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Découvrir les événements locaux (concerts, spectacles, conférences, etc.)</li>
              <li>Rechercher des événements par date, catégorie, lieu ou organisateur</li>
              <li>Accéder aux informations sur les lieux et organisateurs locaux</li>
              <li>Obtenir des informations pratiques sur les événements (dates, horaires, adresses, tarifs)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. Utilisation Acceptable</h2>
            <h3 className="text-xl font-semibold mt-6 mb-3">3.1 Utilisations autorisées</h3>
            <p>Vous pouvez utiliser notre service pour :</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Consulter les informations sur les événements locaux</li>
              <li>Partager des événements via les fonctionnalités de partage de votre appareil</li>
              <li>Utiliser le service à des fins personnelles et non commerciales</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-3">3.2 Utilisations interdites</h3>
            <p>Il est strictement interdit de :</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Utiliser le service à des fins illégales ou frauduleuses</li>
              <li>Tenter d'accéder de manière non autorisée au service ou à ses systèmes</li>
              <li>Reproduire, copier, vendre ou exploiter commercialement tout ou partie du service</li>
              <li>Utiliser des robots, scripts automatisés ou autres moyens pour extraire massivement des données</li>
              <li>Modifier, adapter ou créer des œuvres dérivées du service</li>
              <li>Transmettre des virus, chevaux de Troie ou tout autre code malveillant</li>
              <li>Harceler, menacer ou nuire à d'autres utilisateurs</li>
              <li>Violer les droits de propriété intellectuelle d'autrui</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Comptes Utilisateurs</h2>
            <p>
              Certaines fonctionnalités peuvent nécessiter la création d'un compte. Vous êtes responsable de :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Maintenir la confidentialité de vos identifiants de connexion</li>
              <li>Toutes les activités qui se produisent sous votre compte</li>
              <li>Fournir des informations exactes, actuelles et complètes lors de l'inscription</li>
              <li>Nous informer immédiatement de toute utilisation non autorisée de votre compte</li>
            </ul>
            <p className="mt-4">
              Nous nous réservons le droit de suspendre ou de résilier votre compte en cas de violation 
              de ces Conditions d'Utilisation.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Propriété Intellectuelle</h2>
            <h3 className="text-xl font-semibold mt-6 mb-3">5.1 Contenu du service</h3>
            <p>
              Le service, y compris son contenu, sa structure, son design, ses logos, ses graphismes, 
              ses textes et ses images, est protégé par les lois sur la propriété intellectuelle et 
              appartient à Live Orléans ou à ses concédants de licence.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">5.2 Contenu des tiers</h3>
            <p>
              Les informations sur les événements, organisateurs et lieux proviennent de sources publiques 
              (pages Facebook publiques, sites web publics) et sont utilisées à des fins informatives. 
              Les droits d'auteur sur ces contenus appartiennent à leurs propriétaires respectifs. Nous 
              créditons les sources et fournissons des liens vers les pages d'origine.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">5.3 Licence d'utilisation</h3>
            <p>
              Nous vous accordons une licence limitée, non exclusive, non transférable et révocable pour 
              utiliser le service à des fins personnelles et non commerciales, conformément à ces Conditions 
              d'Utilisation.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Exactitude des Informations</h2>
            <p>
              Nous nous efforçons de fournir des informations exactes et à jour. Cependant :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Les informations sont fournies "en l'état" sans garantie d'exactitude</li>
              <li>Les événements peuvent être modifiés, reportés ou annulés sans préavis</li>
              <li>Nous ne garantissons pas l'exhaustivité des informations</li>
              <li>Il est recommandé de vérifier les informations directement auprès des organisateurs</li>
            </ul>
            <p className="mt-4">
              Nous ne sommes pas responsables des erreurs, omissions ou modifications concernant les 
              informations d'événements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">7. Liens Externes</h2>
            <p>
              Notre service peut contenir des liens vers des sites web tiers, notamment des pages Facebook, 
              des sites d'organisateurs, des services de billetterie, etc. Nous ne sommes pas responsables 
              du contenu, des politiques de confidentialité ou des pratiques de ces sites tiers. 
              L'inclusion de liens ne constitue pas une approbation de notre part.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">8. Limitation de Responsabilité</h2>
            <p>
              Dans les limites permises par la loi :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Le service est fourni "tel quel" sans garantie d'aucune sorte</li>
              <li>Nous ne garantissons pas que le service sera ininterrompu, sécurisé ou exempt d'erreurs</li>
              <li>Nous ne sommes pas responsables des dommages directs, indirects, accessoires ou consécutifs 
                résultant de l'utilisation ou de l'impossibilité d'utiliser le service</li>
              <li>Nous ne sommes pas responsables des événements annulés, modifiés ou reportés</li>
              <li>Nous ne sommes pas responsables des transactions entre utilisateurs et organisateurs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">9. Modification du Service</h2>
            <p>
              Nous nous réservons le droit de :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Modifier, suspendre ou interrompre le service à tout moment</li>
              <li>Modifier ces Conditions d'Utilisation à tout moment</li>
              <li>Ajouter ou supprimer des fonctionnalités</li>
            </ul>
            <p className="mt-4">
              Nous vous informerons des modifications importantes via le service ou par email. 
              Votre utilisation continue du service après les modifications constitue votre acceptation 
              des nouvelles conditions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">10. Résiliation</h2>
            <p>
              Nous nous réservons le droit de résilier ou de suspendre votre accès au service, 
              sans préavis, pour toute raison, notamment en cas de violation de ces Conditions d'Utilisation.
            </p>
            <p className="mt-4">
              Vous pouvez cesser d'utiliser le service à tout moment.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">11. Protection des Données Personnelles</h2>
            <p>
              L'utilisation de vos données personnelles est régie par notre 
              <a href="/privacy-policy" className="text-primary hover:underline">
                {" "}Politique de Confidentialité
              </a>, qui fait partie intégrante de ces Conditions d'Utilisation.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">12. Loi Applicable et Juridiction</h2>
            <p>
              Ces Conditions d'Utilisation sont régies par les lois françaises. Tout litige relatif à 
              ces conditions sera soumis à la compétence exclusive des tribunaux français, et spécifiquement 
              aux tribunaux compétents de la ville d'Orléans, France.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">13. Dispositions Générales</h2>
            <h3 className="text-xl font-semibold mt-6 mb-3">13.1 Intégralité de l'accord</h3>
            <p>
              Ces Conditions d'Utilisation constituent l'intégralité de l'accord entre vous et Live Orléans 
              concernant l'utilisation du service.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">13.2 Divisibilité</h3>
            <p>
              Si une disposition de ces conditions est jugée invalide ou inapplicable, les autres 
              dispositions restent en vigueur.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">13.3 Non-renonciation</h3>
            <p>
              L'absence d'exercice d'un droit ne constitue pas une renonciation à ce droit.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">14. Contact</h2>
            <p>
              Pour toute question concernant ces Conditions d'Utilisation, veuillez nous contacter à :
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p><strong>Email :</strong> lazbutton@gmail.com</p>
              <p className="mt-2"><strong>Adresse :</strong> 1 Av. du Champ de Mars, 45100 Orléans, France</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

