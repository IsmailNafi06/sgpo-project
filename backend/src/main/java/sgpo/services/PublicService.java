package sgpo.services;

import sgpo.dtos.MetierPublicDTO;

import java.util.List;

public interface PublicService {
    List<MetierPublicDTO> getMetiersActifs();
}

