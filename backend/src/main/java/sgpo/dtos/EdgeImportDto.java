package sgpo.dtos;

import lombok.Data;
import sgpo.enums.EdgeType;
import sgpo.enums.TypeAcces;

@Data
public class EdgeImportDto {
    private String id;
    private String source_id;
    private String target_id;
    private EdgeType type_lien;
    private Double taux_reussite;
    private Double cout_supplementaire;
    private Integer duree_supplementaire_mois;
    private String prerequis_notes;
    private Double moyenne_minimale;
    private TypeAcces type_acces;
}
