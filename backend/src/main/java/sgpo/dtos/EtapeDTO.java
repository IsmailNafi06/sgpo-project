package sgpo.dtos;

import lombok.Data;
import sgpo.enums.EdgeType;
import sgpo.enums.NodeType;

@Data
public class EtapeDTO {
    private String code;
    private String nom;
    private NodeType type;         // NIVEAU, FILIERE, ETABLISSEMENT, METIER
    private Integer duree;       // en mois
    private String ville;
    private String secteur;
    private String typeAcces;        // OUVERT, CONCOURS, DOSSIER
    private Double moyenneMinimale;
    private EdgeType typeLien;     // type de l'arête qui précède cette étape
    private Double tauxReussite; // taux de réussite de la transition
}
