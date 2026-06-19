package sgpo.dtos;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import sgpo.enums.TypeAcces;

@Data
public class SearchRequest {
    @JsonProperty("codeDepart")
    private String codeDepart;

    @JsonProperty("codeArrivee")
    private String codeArrivee;

    @JsonProperty("moyenne")
    private Double moyenne;

    @JsonProperty("mobilite")
    private String mobilite;

    @JsonProperty("villeDepart")
    private String villeDepart;

    // filtres
    private Integer dureeMax;       // en mois
    private Double coutMax;         // en DH
    private TypeAcces typeAccesFiltre; // OUVERT, CONCOURS, DOSSIER
}
