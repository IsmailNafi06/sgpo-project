package sgpo.dtos;

import lombok.Data;

import java.util.List;

@Data
public class CheminDTO {
    private String id;
    private List<EtapeDTO> etapes;
    private int dureeTotale;        // en mois
    private double coutTotal;
    private double scoreComposite;
    private String interpretation;
}
